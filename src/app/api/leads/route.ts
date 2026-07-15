import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    // 1. Get default pipeline stages to map UUIDs
    const { data: stages } = await admin
      .from("pipeline_stages")
      .select("id, name, position")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true });

    // 2. Fetch leads joined with contacts
    const { data: leads, error } = await admin
      .from("leads")
      .select(`
        id, value, status, stage_id, created_at,
        contacts(id, full_name, company, phone, email, tags, custom_fields)
      `)
      .eq("workspace_id", workspaceId);

    if (error) throw error;

    // 3. Map leads to frontend format with tags, custom attributes, and notes
    const formattedLeads = await Promise.all((leads ?? []).map(async (l: any) => {
      const c = l.contacts || {};
      
      let latestNote: string | null = null;
      let followupDate: string | null = null;
      let followupCompleted: boolean = false;
      let allTags: string[] = [];

      if (c.id) {
        // Fetch threads for tags
        const { data: threadsData } = await admin
          .from("threads")
          .select("id, tags")
          .eq("contact_id", c.id);
          
        const threadIds = (threadsData ?? []).map(t => t.id);
        const threadTags = (threadsData ?? []).flatMap(t => t.tags ?? []);
        
        allTags = Array.from(new Set([
          ...(c.tags ?? []),
          ...threadTags
        ]));

        if (threadIds.length > 0) {
          const { data: noteMsg } = await admin
            .from("messages")
            .select("content, metadata")
            .in("thread_id", threadIds)
            .eq("metadata->is_note", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
            
          if (noteMsg) {
            latestNote = noteMsg.content;
            followupDate = noteMsg.metadata?.followup_date || null;
            followupCompleted = !!noteMsg.metadata?.followup_completed;
          }
        }
      }

      return {
        id: l.id,
        name: c.full_name || "Unknown",
        company: c.company || "—",
        value: l.value || "—",
        status: l.status || "new",
        created_at: l.created_at,
        phone: c.phone || "",
        email: c.email || "",
        tags: allTags,
        custom_fields: c.custom_fields || {},
        latest_note: latestNote,
        followup_date: followupDate,
        followup_completed: followupCompleted,
      };
    }));

    return NextResponse.json({ leads: formattedLeads, stages });
  } catch (err: any) {
    console.error("[leads GET]", err);
    return NextResponse.json({ error: err.message || "Failed to fetch leads" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();
    const body = await req.json();

    const stageNamesMap: Record<string, string> = {
      new: "New Lead",
      contacted: "Contacted",
      qualified: "Qualified",
      proposal: "Proposal Sent",
      won: "Won",
      lost: "Lost",
    };

    // Get default pipeline
    const { data: pipeline } = await admin
      .from("pipelines")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_default", true)
      .single();
    const pipelineId = pipeline?.id;

    // Resolve helper for inserting single lead
    const insertSingle = async (item: any) => {
      const { name, company, value, status, phone, email, customFields, note, followupDate } = item;
      if (!name) return null;

      // Find or create contact
      let contactId: string;
      const { data: existingContact } = await admin
        .from("contacts")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("full_name", name)
        .limit(1)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
        if (phone || email || customFields) {
          await admin
            .from("contacts")
            .update({
              ...(phone ? { phone } : {}),
              ...(email ? { email } : {}),
              ...(customFields ? { custom_fields: customFields } : {}),
            })
            .eq("id", contactId);
        }
      } else {
        const { data: newContact, error: contactErr } = await admin
          .from("contacts")
          .insert({
            workspace_id: workspaceId,
            full_name: name,
            company: company || null,
            phone: phone || null,
            email: email || null,
            custom_fields: customFields || {},
          })
          .select("id")
          .single();
        if (contactErr) throw contactErr;
        contactId = newContact.id;
      }

      const targetStageName = stageNamesMap[status || "new"] || "New Lead";
      const { data: stage } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", targetStageName)
        .limit(1)
        .single();
      const stageId = stage?.id;

      const numValue = value ? Number(String(value).replace(/[^0-9.]/g, "")) : 0;

      const { data: newLead, error: leadErr } = await admin
        .from("leads")
        .insert({
          workspace_id: workspaceId,
          contact_id: contactId,
          pipeline_id: pipelineId || null,
          stage_id: stageId || null,
          status: status || "new",
          value: numValue,
        })
        .select("*")
        .single();

      if (leadErr) throw leadErr;

      // Create note if provided
      if (note && note.trim()) {
        let threadId: string;
        const { data: existingThread } = await admin
          .from("threads")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("contact_id", contactId)
          .maybeSingle();

        if (existingThread) {
          threadId = existingThread.id;
        } else {
          const { data: newThread } = await admin
            .from("threads")
            .insert({
              workspace_id: workspaceId,
              contact_id: contactId,
              channel: "whatsapp",
              status: "open",
              unread_count: 0,
              last_message_at: new Date().toISOString(),
              last_message_preview: "Lead created manually",
            })
            .select("id")
            .single();
          threadId = newThread?.id;
        }

        await admin.from("messages").insert({
          workspace_id: workspaceId,
          thread_id: threadId,
          content: note.trim(),
          sender_type: "system",
          status: "delivered",
          type: "text",
          metadata: {
            is_note: true,
            ...(followupDate ? { followup_date: followupDate, followup_completed: false } : {}),
          },
        });
      }

      return newLead;
    };

    if (Array.isArray(body)) {
      const results = [];
      for (const item of body) {
        try {
          const res = await insertSingle(item);
          if (res) results.push(res);
        } catch (e) {
          console.error("Bulk insert failed for row:", item, e);
        }
      }
      return NextResponse.json({ leads: results });
    } else {
      const newLead = await insertSingle(body);
      return NextResponse.json({ lead: newLead });
    }
  } catch (err: any) {
    console.error("[leads POST]", err);
    return NextResponse.json({ error: err.message || "Failed to create lead" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();
    const body = await req.json();
    const { id, status, value, name, company, phone, email, customFields, custom_fields, note, followupDate } = body;

    if (!id) {
      return NextResponse.json({ error: "Lead ID is required" }, { status: 400 });
    }

    // 1. If we are updating the status (stage)
    if (status !== undefined && value === undefined && name === undefined && phone === undefined) {
      const stageNamesMap: Record<string, string> = {
        new: "New Lead",
        contacted: "Contacted",
        qualified: "Qualified",
        proposal: "Proposal Sent",
        won: "Won",
        lost: "Lost",
      };
      const targetStageName = stageNamesMap[status] || "New Lead";

      const { data: stage } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", targetStageName)
        .limit(1)
        .single();

      const stageId = stage?.id;

      const { data: updatedLead, error: leadErr } = await admin
        .from("leads")
        .update({
          status,
          stage_id: stageId || null,
        })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select("*")
        .single();

      if (leadErr) throw leadErr;
      return NextResponse.json({ lead: updatedLead });
    }

    // 2. Full details update
    const { data: currentLead } = await admin
      .from("leads")
      .select("contact_id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (currentLead && currentLead.contact_id) {
      const contactUpdates: any = {};
      if (name !== undefined) contactUpdates.full_name = name;
      if (company !== undefined) contactUpdates.company = company || null;
      if (phone !== undefined) contactUpdates.phone = phone || null;
      if (email !== undefined) contactUpdates.email = email || null;
      
      const cf = customFields || custom_fields;
      if (cf !== undefined) contactUpdates.custom_fields = cf || {};

      await admin
        .from("contacts")
        .update(contactUpdates)
        .eq("id", currentLead.contact_id);

      // Create note if provided
      if (note && note.trim()) {
        let threadId: string;
        const { data: existingThread } = await admin
          .from("threads")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("contact_id", currentLead.contact_id)
          .maybeSingle();

        if (existingThread) {
          threadId = existingThread.id;
        } else {
          const { data: newThread } = await admin
            .from("threads")
            .insert({
              workspace_id: workspaceId,
              contact_id: currentLead.contact_id,
              channel: "whatsapp",
              status: "open",
              unread_count: 0,
              last_message_at: new Date().toISOString(),
              last_message_preview: "Lead updated manually",
            })
            .select("id")
            .single();
          threadId = newThread?.id;
        }

        await admin.from("messages").insert({
          workspace_id: workspaceId,
          thread_id: threadId,
          content: note.trim(),
          sender_type: "system",
          status: "delivered",
          type: "text",
          metadata: {
            is_note: true,
            ...(followupDate ? { followup_date: followupDate, followup_completed: false } : {}),
          },
        });
      }
    }

    // Update lead values
    const leadUpdates: any = {};
    if (value !== undefined) {
      leadUpdates.value = value ? Number(String(value).replace(/[^0-9.]/g, "")) : 0;
    }
    if (status !== undefined) {
      const stageNamesMap: Record<string, string> = {
        new: "New Lead",
        contacted: "Contacted",
        qualified: "Qualified",
        proposal: "Proposal Sent",
        won: "Won",
        lost: "Lost",
      };
      const targetStageName = stageNamesMap[status] || "New Lead";

      const { data: stage } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", targetStageName)
        .limit(1)
        .single();
      
      leadUpdates.status = status;
      leadUpdates.stage_id = stage?.id || null;
    }

    const { data: updatedLead, error: leadErr } = await admin
      .from("leads")
      .update(leadUpdates)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();

    if (leadErr) throw leadErr;

    return NextResponse.json({ lead: updatedLead });
  } catch (err: any) {
    console.error("[leads PATCH]", err);
    return NextResponse.json({ error: err.message || "Failed to update lead" }, { status: 500 });
  }
}

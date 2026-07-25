import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing Supabase environment variables in .env");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey);

async function runTests() {
  console.log("🚀 Starting Automated Verification for Workflow & Lead Capture...\n");
  let passed = 0;
  let failed = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Lead Capture Custom Field Interpolation & Phone Validation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("📋 [TEST 1] Testing Lead Capture Utilities & Interpolation...");
  try {
    const { interpolateCustomFields } = await import("../src/services/lead-capture");
    const testLead = { name: "Anushka Sharma", email: "anushka@example.com", phone: "9876543210" };
    const customFields = { company: "Flowra Inc", role: "Manager", budget: "$10k" };
    
    const template = "Hello {{lead_name}} from {{company}}! We received your inquiry for the role of {role} with budget {budget}.";
    const interpolated = interpolateCustomFields(template, customFields, testLead);
    
    const expected = "Hello Anushka Sharma from Flowra Inc! We received your inquiry for the role of Manager with budget $10k.";
    if (interpolated === expected) {
      console.log("   ✅ Lead Capture interpolation passed.");
      passed++;
    } else {
      console.error(`   ❌ Interpolation mismatch!\n      Got:      ${interpolated}\n      Expected: ${expected}`);
      failed++;
    }
  } catch (err: any) {
    console.error("   ❌ Test 1 threw an exception:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: CSV Parsing & Column Resolution (Simulating Sheet Polling)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n📋 [TEST 2] Testing Google Sheet CSV Header Resolution...");
  try {
    const sampleCSV = `Name, WhatsApp Number, Email Address, Interest\nSumit, +91 70032 49959, sumit@test.com, Automation\nRahul, 9830011223, rahul@test.com, AI Voice`;
    const lines = sampleCSV.split("\n").filter(l => l.trim());
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    
    const findColumn = (hdrs: string[], candidates: string[]) => {
      for (const c of candidates) {
        const found = hdrs.find(h => h.includes(c));
        if (found) return found;
      }
      return undefined;
    };

    const phoneCol = findColumn(headers, ["phone", "mobile", "whatsapp", "number"]);
    const nameCol = findColumn(headers, ["name", "full_name", "fullname"]);
    const emailCol = findColumn(headers, ["email", "email_address"]);

    if (phoneCol === "whatsapp number" && nameCol === "name" && emailCol === "email address") {
      console.log("   ✅ CSV header column detection passed.");
      passed++;
    } else {
      console.error(`   ❌ Column resolution mismatch! Got phone=${phoneCol}, name=${nameCol}, email=${emailCol}`);
      failed++;
    }
  } catch (err: any) {
    console.error("   ❌ Test 2 threw an exception:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Synchronous Automated Workflow Execution (Database Integration)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n📋 [TEST 3] Testing End-to-End Workflow Synchronous Execution Engine...");
  let testWorkflowId: string = "";
  let testRunId: string = "";
  let testWorkspaceId: string = "";
  const testPhone = "9999988888";

  try {
    // Find an active workspace
    const { data: workspaces } = await admin.from("workspaces").select("id").limit(1);
    if (!workspaces || workspaces.length === 0) {
      throw new Error("No workspace found in Supabase to run integration test.");
    }
    testWorkspaceId = workspaces[0].id;

    // Define a multi-step branching workflow graph
    const testNodes = [
      { id: "node-1", type: "trigger", data: { type: "trigger", subtype: "google_sheet" } },
      { id: "node-2", type: "condition", data: { subtype: "condition", field: "triggerData.status", operator: "equals", value: "VIP" } },
      { id: "node-3", type: "update_crm", data: { subtype: "update_crm", stage: "vip_automated_test" } },
      { id: "node-4", type: "update_crm", data: { subtype: "update_crm", stage: "standard_automated_test" } },
    ];

    const testEdges = [
      { id: "e1-2", source: "node-1", target: "node-2", sourceHandle: "output" },
      { id: "e2-3", source: "node-2", target: "node-3", sourceHandle: "true" },
      { id: "e2-4", source: "node-2", target: "node-4", sourceHandle: "false" },
    ];

    // Insert test workflow
    const { data: wf, error: wfErr } = await admin.from("workflows").insert({
      workspace_id: testWorkspaceId,
      name: "[Automated Test] Lead Capture -> Condition -> CRM",
      status: "active",
      trigger_type: "google_sheet",
      graph: { nodes: testNodes, edges: testEdges },
      version: 1,
    }).select("id").single();

    if (wfErr || !wf) {
      throw new Error(`Failed to insert test workflow: ${wfErr?.message}`);
    }
    testWorkflowId = wf.id;
    console.log(`   🔸 Created temporary test workflow: ${testWorkflowId}`);

    // Clean up any old test contact
    await admin.from("contacts").delete().eq("workspace_id", testWorkspaceId).eq("phone", testPhone);

    // Invoke automated workflow trigger
    const { runWorkflowTrigger } = await import("../src/lib/workflow/trigger");
    const testTriggerData = {
      phone: testPhone,
      name: "Automated VIP Tester",
      email: "tester@flowra.com",
      status: "VIP" // Should route to node-3 (true branch)
    };

    console.log("   🔸 Triggering workflow synchronously with payload:", JSON.stringify(testTriggerData));
    const result = await runWorkflowTrigger({
      workflowId: testWorkflowId,
      workspaceId: testWorkspaceId,
      triggerData: testTriggerData,
      admin,
    });

    if (!result.ok || !result.runId) {
      throw new Error(`Workflow execution failed: ${result.error}`);
    }
    testRunId = result.runId;
    console.log(`   🔸 Workflow run executed with ID: ${testRunId}`);

    // Verify workflow_runs status
    const { data: runRecord, error: runErr } = await admin.from("workflow_runs").select("*").eq("id", testRunId).single();
    if (runErr || !runRecord) {
      throw new Error(`Failed to fetch workflow run record: ${runErr?.message}`);
    }

    if (runRecord.status === "completed") {
      console.log("   ✅ Workflow run marked as 'completed' in database.");
      passed++;
    } else {
      console.error(`   ❌ Unexpected workflow run status: ${runRecord.status}`);
      failed++;
    }

    // Verify step logs
    const { data: steps } = await admin.from("workflow_run_steps").select("node_id, status").eq("run_id", testRunId);
    const executedNodeIds = (steps || []).map((s: any) => s.node_id);
    console.log("   🔸 Executed node IDs logged in DB:", executedNodeIds.join(", "));

    if (executedNodeIds.includes("node-2") && executedNodeIds.includes("node-3") && !executedNodeIds.includes("node-4")) {
      console.log("   ✅ Branch condition correctly evaluated to TRUE and executed VIP CRM update node without executing FALSE branch.");
      passed++;
    } else {
      console.error(`   ❌ Branching execution verification failed! Executed nodes: ${executedNodeIds.join(", ")}`);
      failed++;
    }

    // Verify contact in database
    const { data: contact } = await admin.from("contacts").select("*").eq("workspace_id", testWorkspaceId).eq("phone", testPhone).maybeSingle();
    if (contact && contact.stage === "vip_automated_test") {
      console.log(`   ✅ CRM Contact created/updated in memory with correct stage: '${contact.stage}'`);
      passed++;
    } else {
      console.error(`   ❌ Contact verification failed! Contact found:`, JSON.stringify(contact));
      failed++;
    }

  } catch (err: any) {
    console.error("   ❌ Test 3 threw an exception:", err.message);
    failed++;
  } finally {
    // Cleanup
    if (testRunId) {
      await admin.from("workflow_run_steps").delete().eq("run_id", testRunId);
      await admin.from("workflow_runs").delete().eq("id", testRunId);
    }
    if (testWorkflowId) {
      await admin.from("workflows").delete().eq("id", testWorkflowId);
    }
    if (testWorkspaceId) {
      await admin.from("contacts").delete().eq("workspace_id", testWorkspaceId).eq("phone", testPhone);
    }
    console.log("   🧹 Cleaned up temporary test data from database.");
  }

  console.log("\n==================================================");
  console.log(`📊 Test Summary: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();

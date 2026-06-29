export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { processScheduledCampaigns } = await import("./services/scheduler");

    // Avoid multiple intervals running in hot-reload (development) mode
    const globalSymbol = Symbol.for("campaignSchedulerInterval");
    const hasGlobal = Object.getOwnPropertySymbols(global).includes(globalSymbol);

    // Disable setInterval on Vercel as it doesn't support persistent background tasks.
    // Instead, rely on Vercel Cron or manual API triggering.
    if (process.env.VERCEL === "1") {
      console.log("Scheduler: Running on Vercel. Disabling background interval. Relying on Cron Jobs.");
      return;
    }

    if (!hasGlobal) {
      console.log("Scheduler: Initializing background scheduled campaign processor...");
      
      // Run immediately on startup
      processScheduledCampaigns().catch((err) => {
        console.error("Scheduler: error in startup execution:", err);
      });

      // Run periodically
      const intervalId = setInterval(async () => {
        try {
          await processScheduledCampaigns();
        } catch (err) {
          console.error("Scheduler: error executing scheduled campaigns run:", err);
        }
      }, 30000); // Check every 30 seconds

      // Store on global
      (global as any)[globalSymbol] = intervalId;
    }
  }
}

const fs = require("fs");
const path = require("path");

// Load .env manually
const envPath = path.join(__dirname, "../../.env");
let env = {};
try {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach(line => {
    const parts = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (parts) {
      const key = parts[1];
      let val = parts[2] || "";
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      env[key] = val.trim();
    }
  });
} catch (e) {
  console.error("Failed to read .env file:", e);
}

const wabaId = env.META_WABA_ID;
const token = env.META_ACCESS_TOKEN;

if (!wabaId || !token) {
  console.error("Error: META_WABA_ID or META_ACCESS_TOKEN is missing in .env");
  console.log("Read keys:", Object.keys(env));
  process.exit(1);
}

async function run() {
  const url = `https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`;
  
  console.log(`Checking current subscriptions for WABA ID: ${wabaId}...`);
  try {
    const getRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const getData = await getRes.json();
    console.log("GET Subscriptions Response:", JSON.stringify(getData, null, 2));

    console.log("\nSubscribing app to WABA events...");
    const postRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const postData = await postRes.json();
    console.log("POST Subscribe Response:", JSON.stringify(postData, null, 2));
  } catch (error) {
    console.error("Request failed:", error);
  }
}

run();

// Sarvam AI voice definitions with metadata
export const SARVAM_VOICES = [
  // bulbul:v2 — Female
  { id: "anushka", name: "Anushka", gender: "Female", model: "bulbul:v2", style: "Warm & Friendly", language: "Hindi/English" },
  { id: "manisha", name: "Manisha", gender: "Female", model: "bulbul:v2", style: "Professional", language: "Hindi/English" },
  { id: "vidya",   name: "Vidya",   gender: "Female", model: "bulbul:v2", style: "Clear & Calm",  language: "Hindi/English" },
  { id: "arya",    name: "Arya",    gender: "Female", model: "bulbul:v2", style: "Expressive",    language: "Hindi/English" },
  // bulbul:v2 — Male
  { id: "abhilash", name: "Abhilash", gender: "Male", model: "bulbul:v2", style: "Deep & Steady", language: "Hindi/English" },
  { id: "karun",    name: "Karun",    gender: "Male", model: "bulbul:v2", style: "Natural",        language: "Hindi/English" },
  { id: "hitesh",   name: "Hitesh",   gender: "Male", model: "bulbul:v2", style: "Confident",      language: "Hindi/English" },
  // bulbul:v3-beta — Customer Care Female
  { id: "ritu",   name: "Ritu",   gender: "Female", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "pooja",  name: "Pooja",  gender: "Female", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "simran", name: "Simran", gender: "Female", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "kavya",  name: "Kavya",  gender: "Female", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "ishita", name: "Ishita", gender: "Female", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "shreya", name: "Shreya", gender: "Female", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "priya",  name: "Priya",  gender: "Female", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  // bulbul:v3-beta — Customer Care Male
  { id: "shubh",  name: "Shubh",  gender: "Male", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "rahul",  name: "Rahul",  gender: "Male", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "amit",   name: "Amit",   gender: "Male", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "ratan",  name: "Ratan",  gender: "Male", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "rohan",  name: "Rohan",  gender: "Male", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "dev",    name: "Dev",    gender: "Male", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "manan",  name: "Manan",  gender: "Male", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  { id: "sumit",  name: "Sumit",  gender: "Male", model: "bulbul:v3-beta", style: "Customer Care", language: "Hindi/English" },
  // bulbul:v3-beta — Content Creation
  { id: "aditya",  name: "Aditya",  gender: "Male",   model: "bulbul:v3-beta", style: "Content", language: "Hindi/English" },
  { id: "kabir",   name: "Kabir",   gender: "Male",   model: "bulbul:v3-beta", style: "Content", language: "Hindi/English" },
  { id: "neha",    name: "Neha",    gender: "Female", model: "bulbul:v3-beta", style: "Content", language: "Hindi/English" },
  { id: "varun",   name: "Varun",   gender: "Male",   model: "bulbul:v3-beta", style: "Content", language: "Hindi/English" },
  { id: "roopa",   name: "Roopa",   gender: "Female", model: "bulbul:v3-beta", style: "Content", language: "Hindi/English" },
  { id: "aayan",   name: "Aayan",   gender: "Male",   model: "bulbul:v3-beta", style: "Content", language: "Hindi/English" },
  { id: "ashutosh",name: "Ashutosh",gender: "Male",   model: "bulbul:v3-beta", style: "Content", language: "Hindi/English" },
  { id: "advait",  name: "Advait",  gender: "Male",   model: "bulbul:v3-beta", style: "Content", language: "Hindi/English" },
  // bulbul:v3-beta — International
  { id: "amelia",  name: "Amelia",  gender: "Female", model: "bulbul:v3-beta", style: "International", language: "English" },
  { id: "sophia",  name: "Sophia",  gender: "Female", model: "bulbul:v3-beta", style: "International", language: "English" },
] as const;

export type SarvamVoiceId = (typeof SARVAM_VOICES)[number]["id"];

export const GEMINI_VOICES = [
  { id: "Zephyr",   name: "Zephyr",   style: "Bright",     description: "Clear and lively" },
  { id: "Puck",     name: "Puck",     style: "Upbeat",     description: "Energetic and fun" },
  { id: "Charon",   name: "Charon",   style: "Informative",description: "Calm, authoritative" },
  { id: "Kore",     name: "Kore",     style: "Firm",       description: "Direct and confident" },
  { id: "Fenrir",   name: "Fenrir",   style: "Excitable",  description: "Enthusiastic" },
  { id: "Leda",     name: "Leda",     style: "Youthful",   description: "Fresh and friendly" },
  { id: "Orus",     name: "Orus",     style: "Firm",       description: "Strong and assertive" },
  { id: "Aoede",    name: "Aoede",    style: "Breezy",     description: "Light and natural" },
  { id: "Callirrhoe",name:"Callirrhoe",style:"Easy-going", description: "Relaxed and smooth" },
  { id: "Autonoe",  name: "Autonoe",  style: "Bright",     description: "Warm and cheerful" },
  { id: "Enceladus",name: "Enceladus",style:"Breathy",     description: "Soft and intimate" },
  { id: "Iocaste",  name: "Iocaste",  style: "Informative",description: "Clear and precise" },
  { id: "Umbriel",  name: "Umbriel",  style: "Easy-going", description: "Smooth and gentle" },
  { id: "Algieba",  name: "Algieba",  style: "Smooth",     description: "Rich and velvety" },
  { id: "Despina",  name: "Despina",  style: "Smooth",     description: "Flowing and natural" },
  { id: "Erinome",  name: "Erinome",  style: "Clear",      description: "Crisp and precise" },
  { id: "Algenib",  name: "Algenib",  style: "Gravelly",   description: "Deep and textured" },
  { id: "Rasalghul",name: "Rasalghul",style: "Informative",description: "Steady and reliable" },
  { id: "Laomedeia",name: "Laomedeia",style:"Upbeat",      description: "Bright and peppy" },
  { id: "Achernar", name: "Achernar", style: "Soft",       description: "Gentle and warm" },
  { id: "Alnilam",  name: "Alnilam",  style: "Firm",       description: "Solid and composed" },
  { id: "Schedar",  name: "Schedar",  style: "Even",       description: "Balanced and neutral" },
  { id: "Gacrux",   name: "Gacrux",   style: "Mature",     description: "Experienced tone" },
  { id: "Pulcherrima",name:"Pulcherrima",style:"Forward",  description: "Bold and forward" },
  { id: "Achird",   name: "Achird",   style: "Friendly",   description: "Approachable warmth" },
  { id: "Zubenelgenubi",name:"Zubenelgenubi",style:"Casual",description:"Relaxed and casual" },
  { id: "Vindemiatrix",name:"Vindemiatrix",style:"Gentle", description:"Soft and considerate" },
  { id: "Sadachbia",name:"Sadachbia", style:"Lively",      description:"Vibrant and spirited" },
  { id: "Sulafat",  name: "Sulafat",  style: "Warm",       description: "Cozy and inviting" },
  { id: "Sadaltager",name:"Sadaltager",style:"Knowledgeable",description:"Confident expertise"},
] as const;

export type GeminiVoiceId = (typeof GEMINI_VOICES)[number]["id"];

// supabase.js
// ⚠️ Ganti dengan kredensial project Supabase Anda
// Dashboard → Project Settings → API
const SUPABASE_URL = "https://idoskrzggxnnhaohlefq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkb3NrcnpnZ3hubmhhb2hsZWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTI5OTIsImV4cCI6MjA5Nzk2ODk5Mn0.J07f24jpgXXHOuAaGmVAzIhnA5eRiks2m981cinwfbA";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET = "checkup-photos";
const MAX_FOTO = 10;

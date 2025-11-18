// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // 開発中にすぐ気づけるようにコンソールに出す
  // 本番ビルドでは env を必ず設定しておくこと
  // eslint-disable-next-line no-console
  console.error(
    "[supabaseClient] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が設定されていません"
  );
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    persistSession: false,
  },
});

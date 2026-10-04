# Supabase setup

1. Create a Supabase project and open **SQL Editor**.
2. Run the complete contents of `supabase-setup.sql`.
3. In **Project Settings > API**, copy the project URL and `anon` / publishable key into `supabase-config.js`. Never put a `service_role` key in browser code.
4. In **Authentication > Users**, create an account for each authority. Copy each user's UUID, then add it in SQL:

   ```sql
   insert into public.authority_users (user_id)
   values ('AUTH_USER_UUID');
   ```

5. Serve this folder over HTTP (for example, VS Code Live Server). The forms, tracking page, and authority dashboard use the configured project.

The setup script enables row-level security. Anyone can submit a complaint and upload optional evidence; only listed authority accounts can read complaint details or update status. Public tracking returns only the status fields and requires the complaint UUID shown after submission. The private evidence bucket limits uploads to 5 MB and common image formats.

# Supabase Setup Guide — Formation Group

## Step 1: Create a Supabase project
1. Go to https://supabase.com
2. Sign up / log in
3. Click "New project"
4. Name: "formation-group"
5. Region: Sydney (ap-southeast-2)
6. Set a database password and save it

## Step 2: Run the database schema
1. In Supabase, click "SQL Editor" in the left sidebar
2. Click "New query"
3. Copy the contents of `supabase/schema.sql`
4. Paste and click "Run"

## Step 3: Get your API keys
1. Go to Settings → API in your Supabase project
2. Copy "Project URL" (looks like https://xxxxx.supabase.co)
3. Copy "anon/public" key

## Step 4: Add to Vercel
1. Go to https://vercel.com → formation-group project → Settings → Environment Variables
2. Add: `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
3. Add: `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
4. Click Save, then redeploy

## Step 5: Migrate existing data
Once connected, go to Settings in the app and click "Sync to Supabase" to push all local data to the database.

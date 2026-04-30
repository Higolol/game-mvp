import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Fallback to service role key if available, otherwise use anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase URL or Key in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  try {
    const dataPath = path.resolve(__dirname, 'questions.json');
    console.log(`Reading data from ${dataPath}...`);
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const jsonData = JSON.parse(rawData);

    // Map the JSON structure to the database table schema
    const questionsToInsert = jsonData.Questions.map((q: { Question_Text: string }) => ({
      question_text: q.Question_Text,
    }));

    console.log(`Found ${questionsToInsert.length} questions to insert.`);

    // Insert all records at once into the 'questions' table
    const { data, error } = await supabase
      .from('questions')
      .insert(questionsToInsert)
      .select();

    if (error) {
      console.error('Error inserting data into Supabase:', error);
    } else {
      console.log(`✅ Successfully inserted ${data?.length || questionsToInsert.length} questions into the database!`);
    }
  } catch (err) {
    console.error('Failed to seed database:', err);
  }
}

seed();

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Pool } from 'pg';
import { OpenAI } from 'openai';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

const schoolNameAssistantID = "asst_g4ZcfFEZehbk1LF61OjReFNp";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Check if user already has school_name
  try {
    const result = await pool.query(
      'SELECT school_name FROM "user" WHERE email = $1',
      [session.user.email]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ message: "ERROR: User not found" }, { status: 404 });
    }

    const currentSchoolName = result.rows[0].school_name;
    if (currentSchoolName && currentSchoolName !== "") {
      return NextResponse.json({ message: "Success!" }, { status: 200 });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "ERROR: Database error" }, { status: 500 });
  }

  // Check if school_mappings exists for user’s email suffix
  const emailSuffix: string = session.user.email.split("@")[1];
  try {
    const mappingResult = await pool.query(
      'SELECT school_name FROM school_mappings WHERE email_suffix = $1',
      [emailSuffix]
    );

    if (mappingResult.rows.length > 0) {
      const mappedSchoolName = mappingResult.rows[0].school_name;

      if (mappedSchoolName && mappedSchoolName !== "") {
        // update user table with mapped school name
        await pool.query(
          'UPDATE "user" SET school_name = $1 WHERE email = $2',
          [mappedSchoolName, session.user.email]
        );

        return NextResponse.json({ message: "Success!" }, { status: 200 });
      }
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "ERROR: Database error (school_mappings)" }, { status: 500 });
  }

  // If not found, use OpenAI to generate school name
  try {
    const assistant = await openai.beta.assistants.retrieve(schoolNameAssistantID);

    const instructions = assistant.instructions ?? "";
    const model = assistant.model;
    const temperature = assistant.temperature;
    const topP = assistant.top_p;

    const input_prompt: string = `
        SUFFIX: "${emailSuffix}"
        RESPONSE =>
    `;

    const response = await openai.chat.completions.create({
      model: model,
      temperature: temperature,
      top_p: topP,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input_prompt }
      ]
    });

    const rawOutput = response.choices[0].message.content ?? "";
    let generatedSchoolName: string = "UNKNOWN";

    try {
      const parsedOutput = JSON.parse(rawOutput);
      generatedSchoolName = parsedOutput.VALUE ?? "UNKNOWN";
    } catch (error) {
      console.error(error);
      return NextResponse.json({ message: "ERROR: Failed to parse assistant output" }, { status: 101 });
    }

    // Only insert if AI generated a valid name
    if (generatedSchoolName !== "UNKNOWN") {
      try {
        // update user table
        await pool.query(
          'UPDATE "user" SET school_name = $1 WHERE email = $2',
          [generatedSchoolName, session.user.email]
        );

        // insert or update school_mappings table
        await pool.query(
          `INSERT INTO school_mappings (email_suffix, school_name)
           VALUES ($1, $2)
           ON CONFLICT (email_suffix) DO NOTHING`,
          [emailSuffix, generatedSchoolName]
        );
      } catch (error) {
        console.error("Error while updating DB with AI-generated school name:", error);
        return NextResponse.json({ message: "ERROR: Database error while saving generated school name" }, { status: 500 });
      }
    }

    return NextResponse.json({ message: "Success!" }, { status: 200 });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "ERROR: OpenAI API error" }, { status: 500 });
  }
}

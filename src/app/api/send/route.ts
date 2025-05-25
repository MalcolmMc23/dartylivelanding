import { EmailTemplate } from '@/components/email-template';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email, firstName } = await request.json(); // <-- Accept dynamic data

    const { data, error } = await resend.emails.send({
      from: 'DormParty <fredrickf@dormparty.live>', // <-- Your sender
      to: [email], // <-- Send to user's email
      subject: 'Welcome to DormParty!',
      react: EmailTemplate({ firstName }) as React.ReactElement
    });

    if (error) {
      console.error("Resend API error:", error); // Add this line for logging
      return Response.json({ error }, { status: 500 });
    }

    return Response.json(data);
  } catch (error) {
    console.error("Send route exception:", error); // Add this line for logging
    return Response.json({ error }, { status:500 });
  }
}
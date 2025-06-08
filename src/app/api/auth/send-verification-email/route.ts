import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { VerificationEmail } from '@/emails/VerificationEmail';
import { render } from '@react-email/render';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email, username, verificationToken } = await request.json();

    if (!email || !username || !verificationToken) {
      return NextResponse.json(
        { error: 'Email, username, and verification token are required' },
        { status: 400 }
      );
    }

    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`;
    const emailHtml = await render(VerificationEmail({ username, verificationUrl }));

    const data = await resend.emails.send({
      from: 'DormParty <fredrickf@dormparty.live>',
      to: email,
      subject: 'Verify your DormParty account',
      html: emailHtml,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error sending verification email:', error);
    return NextResponse.json(
      { error: 'Failed to send verification email' },
      { status: 500 }
    );
  }
} 
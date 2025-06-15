import { NextResponse } from 'next/server';

export async function POST(req: Request) {

    try {
        const body = await req.json();
        const username = body.username;
        const reportCount = body.reportCount;

        const payload = {
            content: `Moderation Alert: ${username} has been reported ${reportCount} times.`
        };

        const webhook_url = process.env.REPORTED_USERS_DISCORD;

        if (!webhook_url) {
            console.error("Discord webhook URL not set in environment");
            return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
        }

        const response = await fetch(webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("Discord webhook failed:", await response.text());
            return NextResponse.json({ message: "Failed to send Discord notification" }, { status: 500 });
        }

        return NextResponse.json({ message: "Notification sent!" }, { status: 200 });
    } catch (error) {
        console.error("Error:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
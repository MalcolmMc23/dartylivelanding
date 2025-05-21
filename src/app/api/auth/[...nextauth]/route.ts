import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcrypt';
import { Pool } from 'pg';
import { NextAuthOptions } from 'next-auth';

// Setup Postgres connection
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false, // for Railway or similar — safe to remove if you're local
  },
});

const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Query the user from your 'user' table
        const result = await pool.query(
          'SELECT * FROM "user" WHERE email = $1',
          [credentials.email]
        );
        const user = result.rows[0];

        if (!user) {
          return null;
        }

        // Compare plaintext password with hashed password from db
        const passwordCorrect = await compare(credentials.password, user.password);

        if (passwordCorrect) {
          return {
            id: user.id,
            email: user.email,
          };
        }

        return null;
      },
    }),
  ],
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

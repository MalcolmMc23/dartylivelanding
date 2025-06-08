import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Text,
  } from '@react-email/components';
  import * as React from 'react';
  
  interface VerificationEmailProps {
    username: string;
    verificationUrl: string;
  }
  
  export const VerificationEmail = ({
    username,
    verificationUrl,
  }: VerificationEmailProps) => {
    return (
      <Html>
        <Head />
        <Preview>Verify your DormParty account</Preview>
        <Body style={main}>
          <Container style={container}>
            <Heading style={h1}>Welcome to DormParty!</Heading>
            <Text style={text}>
              Hi {username},
            </Text>
            <Text style={text}>
              Thanks for signing up! To start using DormParty, please verify your email address by clicking the button below:
            </Text>
            <Button
              href={verificationUrl}
              style={button}
            >
              Verify Email Address
            </Button>
            <Text style={text}>
              This link will expire in 24 hours. If you didn't create an account with DormParty, you can safely ignore this email.
            </Text>
            <Text style={text}>
              Best regards,<br />
              The DormParty Team
            </Text>
          </Container>
        </Body>
      </Html>
    );
  };
  
  const main = {
    backgroundColor: '#121212',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
  };
  
  const container = {
    margin: '0 auto',
    padding: '20px 0 48px',
    maxWidth: '560px',
  };
  
  const h1 = {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: '600',
    lineHeight: '40px',
    margin: '0 0 20px',
  };
  
  const text = {
    color: '#ffffff',
    fontSize: '16px',
    lineHeight: '24px',
    margin: '16px 0',
  };
  
  const button = {
    backgroundColor: '#A855F7',
    borderRadius: '12px',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '600',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    padding: '12px 24px',
    margin: '24px 0',
  };
  
  export default VerificationEmail; 
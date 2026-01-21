import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirection is handled both by the Proxy (Middleware) 
  // and this root page as a fallback.
  redirect('/en');
}

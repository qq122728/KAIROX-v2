import { FluxMobileApp } from "../components/FluxMobileApp";
// Auth pages must always receive fresh HTML/RSC after a deployment.
export const dynamic = "force-dynamic";
export const revalidate = 0;


export default function LoginPage() {
  return <FluxMobileApp initialAuthMode="login" />;
}

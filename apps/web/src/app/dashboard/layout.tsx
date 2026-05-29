import { NotificationsToaster } from '@/components/notifications-toaster';

// Wraps every /dashboard page with the live notification toaster (N5).
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <NotificationsToaster />
    </>
  );
}

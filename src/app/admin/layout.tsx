import '@/styles/admin.css';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-theme">{children}</div>;
}

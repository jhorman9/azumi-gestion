import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Azumi | Panel administrativo",
  description: "Gestión interna del restaurante Azumi",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

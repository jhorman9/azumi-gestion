import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Gerencial",
  description: "Administración interna del restaurante",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

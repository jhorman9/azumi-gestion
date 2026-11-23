import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatMoney } from "@/lib/finance/money";

interface QuotationPdfDocumentProps {
  logoSrc: string;
  quoteNumber: string;
  quoteDate: string;
  validUntil: string;
  client: {
    name: string;
    phone: string;
    email: string;
    address: string;
  };
  lines: {
    description: string;
    quantity: string;
    unitPrice: string;
  }[];
  lineTotals: string[];
  subtotal: string;
  tax: string;
  total: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 48,
    paddingBottom: 48,
    paddingLeft: 48,
    color: "#292522",
    fontFamily: "Helvetica",
    fontSize: 9,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 18,
    borderBottomWidth: 2,
    borderBottomColor: "#b4232c",
  },
  company: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 16,
  },
  brandLogo: {
    width: 90,
    height: 75,
    marginBottom: 5,
  },
  companyName: {
    marginBottom: 5,
    fontSize: 11,
    fontWeight: "bold",
  },
  companyDetail: {
    marginTop: 3,
    color: "#625a55",
    fontSize: 8,
    lineHeight: 1.4,
  },
  numberBox: {
    alignSelf: "flex-start",
    minWidth: 125,
    padding: 11,
    backgroundColor: "#fbf3f2",
  },
  numberLabel: {
    marginBottom: 6,
    color: "#a1262d",
    fontSize: 8,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  number: {
    fontSize: 10,
    fontWeight: "bold",
  },
  meta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 18,
    marginBottom: 15,
  },
  metaItem: {
    minWidth: 140,
    marginLeft: 18,
  },
  metaLabel: {
    marginBottom: 4,
    color: "#817973",
    fontSize: 7,
    fontWeight: "bold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 9,
  },
  clientBox: {
    marginBottom: 20,
    padding: 13,
    borderWidth: 1,
    borderColor: "#eee9e6",
    backgroundColor: "#fcfbfa",
  },
  blockLabel: {
    marginBottom: 7,
    color: "#817973",
    fontSize: 7,
    fontWeight: "bold",
    letterSpacing: 0.8,
  },
  clientName: {
    marginBottom: 5,
    fontSize: 10,
    fontWeight: "bold",
  },
  clientDetail: {
    marginTop: 3,
    color: "#625a55",
    fontSize: 8,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: "#f7f5f4",
    borderBottomWidth: 1,
    borderBottomColor: "#ded8d4",
    color: "#625a55",
    fontSize: 8,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee9e6",
    fontSize: 8,
  },
  description: {
    width: "49%",
    paddingRight: 8,
  },
  quantity: {
    width: "12%",
    textAlign: "right",
  },
  unitPrice: {
    width: "19%",
    textAlign: "right",
  },
  lineTotal: {
    width: "20%",
    textAlign: "right",
  },
  summary: {
    width: 220,
    alignSelf: "flex-end",
    marginTop: 18,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    color: "#625a55",
  },
  summaryValue: {
    color: "#292522",
    fontWeight: "bold",
  },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#dcd5d1",
    fontSize: 11,
    fontWeight: "bold",
  },
  grandTotalValue: {
    color: "#a91f27",
  },
  footer: {
    marginTop: 36,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee9e6",
    color: "#817973",
    fontSize: 8,
    lineHeight: 1.5,
  },
});

function formatPdfDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "—";
  }
  return new Intl.DateTimeFormat("es-PA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function QuotationPdfDocument({
  logoSrc,
  quoteNumber,
  quoteDate,
  validUntil,
  client,
  lines,
  lineTotals,
  subtotal,
  tax,
  total,
}: QuotationPdfDocumentProps) {
  return (
    <Document
      author="RESTAURANTE AZUMI BISTRO INC"
      subject="Cotización de productos y servicios"
      title={`Cotización ${quoteNumber}`}
    >
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header} wrap={false}>
          <View style={styles.company}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={logoSrc} style={styles.brandLogo} />
            <Text style={styles.companyName}>RESTAURANTE AZUMI BISTRO INC</Text>
            <Text style={styles.companyDetail}>RUC: 155744922-2-2023 DV99</Text>
            <Text style={styles.companyDetail}>
              San Francisco, calle 72, frente al Instituto Italiano Enrico Fermi,
              locales 2 y 3.
            </Text>
            <Text style={styles.companyDetail}>
              diana@azumipty.com · +507 6045-4821
            </Text>
          </View>
          <View style={styles.numberBox}>
            <Text style={styles.numberLabel}>COTIZACIÓN</Text>
            <Text style={styles.number}>{quoteNumber}</Text>
          </View>
        </View>

        <View style={styles.meta} wrap={false}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Fecha</Text>
            <Text style={styles.metaValue}>{formatPdfDate(quoteDate)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Válida hasta</Text>
            <Text style={styles.metaValue}>{formatPdfDate(validUntil)}</Text>
          </View>
        </View>

        <View style={styles.clientBox} wrap={false}>
          <Text style={styles.blockLabel}>COTIZADA PARA</Text>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientDetail}>{client.phone}</Text>
          <Text style={styles.clientDetail}>{client.email}</Text>
          {client.address ? (
            <Text style={styles.clientDetail}>{client.address}</Text>
          ) : null}
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={styles.description}>Descripción</Text>
          <Text style={styles.quantity}>Cant.</Text>
          <Text style={styles.unitPrice}>Precio unitario</Text>
          <Text style={styles.lineTotal}>Importe</Text>
        </View>
        {lines.map((line, index) => (
          <View key={index} style={styles.tableRow} wrap={false}>
            <Text style={styles.description}>{line.description}</Text>
            <Text style={styles.quantity}>{line.quantity}</Text>
            <Text style={styles.unitPrice}>
              {formatMoney(line.unitPrice)}
            </Text>
            <Text style={styles.lineTotal}>
              {formatMoney(lineTotals[index])}
            </Text>
          </View>
        ))}

        <View style={styles.summary} wrap={false}>
          <View style={styles.summaryRow}>
            <Text>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatMoney(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>ITBMS (7%)</Text>
            <Text style={styles.summaryValue}>{formatMoney(tax)}</Text>
          </View>
          <View style={styles.grandTotal}>
            <Text>Total</Text>
            <Text style={styles.grandTotalValue}>{formatMoney(total)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>
            Gracias por considerar a Restaurante Azumi Bistro Inc. Esta
            cotización es válida hasta la fecha indicada.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

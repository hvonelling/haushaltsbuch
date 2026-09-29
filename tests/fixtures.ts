// Erfundene Beispieldaten für Tests (keine echten Konten).

export const DKB_CSV = [
  '"Girokonto";"DE00 1203 0000 0000 0000 01"',
  '"Zeitraum:";"01.07.2026 - 28.09.2026"',
  '"Kontostand vom 28.09.2026:";"2.345,67 €"',
  '""',
  '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"',
  '"01.09.26";"01.09.26";"Gebucht";"Muster, Max";"Beispiel Wohnbau GmbH";"Miete September";"Ausgang";"DE00 5005 0000 0000 0000 02";"-950,00";"";"";""',
  '"03.09.26";"03.09.26";"Gebucht";"Muster, Max";"REWE Markt";"Einkauf";"Ausgang";"DE00 5005 0000 0000 0000 03";"-54,21";"";"";""',
  '"03.09.26";"03.09.26";"Gebucht";"Muster, Max";"REWE Markt";"Einkauf";"Ausgang";"DE00 5005 0000 0000 0000 03";"-54,21";"";"";""',
  '"05.09.26";"05.09.26";"Vorgemerkt";"Muster, Max";"Aral Tankstelle";"Tanken";"Ausgang";"";"-60,00";"";"";""',
  '"06.09.26";"06.09.26";"Gebucht";"Muster, Max";"PayPal Europe";"Ihr Einkauf bei Buchladen XY";"Ausgang";"DE00 5005 0000 0000 0000 04";"-19,99";"";"";""',
  '"30.09.26";"30.09.26";"Gebucht";"Arbeitgeber AG";"Muster, Max";"Lohn/Gehalt 09/2026";"Eingang";"DE00 5005 0000 0000 0000 05";"3.100,00";"";"";""',
].join("\n");

export const SPK_CSV = [
  '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"',
  '"DE00350500000000000009";"02.09.26";"02.09.26";"LASTSCHRIFT";"Purchase at Sportgeschaeft Z";"";"";"REF1";"";"";"";"Klarna Bank";"DE00 5005 0000 0000 0000 06";"";"-89,90";"EUR";"Umsatz gebucht"',
  '"DE00350500000000000009";"04.09.26";"04.09.26";"GUTSCHRIFT";"Uebertrag";"";"";"REF2";"";"";"";"Max Muster";"DE00 1203 0000 0000 0000 01";"";"200,00";"EUR";"Umsatz gebucht"',
  '"DE00350500000000000009";"05.09.26";"05.09.26";"LASTSCHRIFT";"Strom Abschlag";"";"";"REF3";"";"";"";"Stadtwerke Musterstadt";"DE00 5005 0000 0000 0000 07";"";"-80,00";"EUR";"Umsatz vorgemerkt"',
].join("\n");

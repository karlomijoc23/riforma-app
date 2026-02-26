import React from "react";
import { formatDate } from "../../shared/formatters";

const HandoverProtocolPrintTemplate = React.forwardRef(
  ({ protocol, contract, property, tenant, companyInfo }, ref) => {
    if (!protocol || !contract) return null;

    const isEntry = protocol.type === "entry";
    const title = isEntry
      ? "ZAPISNIK O PRIMOPREDAJI POSLOVNOG PROSTORA (ULAZNI)"
      : "ZAPISNIK O PRIMOPREDAJI POSLOVNOG PROSTORA (IZLAZNI)";

    return (
      <>
        <style type="text/css" media="print">
          {`
                    @page { size: A4 portrait; margin: 0; }
                    body { -webkit-print-color-adjust: exact; }
                `}
        </style>
        <div
          ref={ref}
          className="bg-white text-black p-8 mx-auto"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "20mm",
            fontSize: "12pt",
            fontFamily: "'Inter', sans-serif",
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <div className="text-center mb-8 border-b-2 border-black pb-4">
            <h1 className="text-xl font-bold uppercase mb-2">
              {companyInfo?.name || "Riforma d.o.o."}
            </h1>
            <p className="text-sm">
              {companyInfo?.address || "Adresa tvrtke, Grad"}
            </p>
            <p className="text-sm">OIB: {companyInfo?.oib || "12345678901"}</p>
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <h2 className="text-lg font-bold uppercase underline">{title}</h2>
            <p className="mt-2">
              sastavljen dana {formatDate(protocol.date)} godine u prostoru koji
              je predmet zakupa.
            </p>
          </div>

          {/* Parties */}
          <div className="mb-6">
            <p className="mb-2">
              <strong>ZAKUPODAVAC:</strong>{" "}
              {companyInfo?.name || "Riforma d.o.o."}, zastupan po direktoru.
            </p>
            <p className="mb-2">
              <strong>ZAKUPNIK:</strong>{" "}
              {tenant?.naziv_firme || tenant?.ime_prezime || "—"}, OIB:{" "}
              {tenant?.oib || "—"}, zastupan po ovlaštenoj osobi.
            </p>
          </div>

          {/* Premise */}
          <div className="mb-6">
            <p className="mb-2">
              <strong>PREDMET ZAKUPA:</strong> Poslovni prostor na adresi{" "}
              {property?.adresa || "—"},
              {property?.grad ? ` ${property.grad}` : ""}, ukupne površine{" "}
              {contract.povrsina_m2 || property?.povrsina || "—"} m².
            </p>
            <p>
              Ugovor o zakupu sklopljen dana:{" "}
              {formatDate(contract.datum_potpisivanja || contract.created_at)}.
            </p>
          </div>

          {/* Meter Readings */}
          <div className="mb-8">
            <h3 className="font-bold uppercase mb-4 border-b border-black inline-block">
              1. Stanja brojila
            </h3>
            <table className="w-full border-collapse border border-black text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black p-3 text-left font-semibold w-[30%]">
                    Energent / Brojilo
                  </th>
                  <th className="border border-black p-3 text-left font-semibold w-[30%]">
                    Broj brojila
                  </th>
                  <th className="border border-black p-3 text-right font-semibold w-[20%]">
                    Stanje
                  </th>
                  <th className="border border-black p-3 text-left font-semibold w-[20%]">
                    Jedinica
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(protocol.meter_readings || {}).map(
                  ([key, value]) => (
                    <tr key={key}>
                      <td className="border border-black p-3 capitalize font-medium">
                        {key}
                      </td>
                      <td className="border border-black p-3 text-gray-600">
                        —
                      </td>
                      <td className="border border-black p-3 text-right font-mono font-bold whitespace-nowrap">
                        {value}
                      </td>
                      <td className="border border-black p-3 text-gray-600">
                        {key.toLowerCase().includes("struja")
                          ? "kWh"
                          : key.toLowerCase().includes("plin")
                            ? "m³"
                            : key.toLowerCase().includes("voda")
                              ? "m³"
                              : ""}
                      </td>
                    </tr>
                  ),
                )}
                {Object.keys(protocol.meter_readings || {}).length === 0 && (
                  <tr>
                    <td
                      colSpan="4"
                      className="border border-black p-6 text-center italic text-gray-500"
                    >
                      Nema unesenih stanja brojila.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Keys */}
          <div className="mb-8">
            <h3 className="font-bold uppercase mb-4 border-b border-black inline-block">
              2. Primopredaja ključeva
            </h3>
            <p className="mb-2">
              {isEntry
                ? "Zakupodavac predaje, a Zakupnik preuzima"
                : "Zakupnik vraća, a Zakupodavac preuzima"}{" "}
              sljedeće ključeve:
            </p>
            <div className="border border-black p-4 min-h-[60px]">
              {protocol.keys_handed_over || "Nema specifikacije ključeva."}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-12">
            <h3 className="font-bold uppercase mb-4 border-b border-black inline-block">
              3. Napomene i uočeni nedostaci
            </h3>
            <div className="border border-black p-4 min-h-[100px]">
              {protocol.notes || "Nema posebnih napomena."}
            </div>
          </div>

          {/* Signatures */}
          <div className="flex justify-between mt-16 pt-8">
            <div className="text-center w-1/3">
              <div className="border-t border-black pt-2 mb-2">
                <p className="font-bold">ZA ZAKUPODAVCA</p>
              </div>
              <p className="text-xs text-gray-500">(Potpis i pečat)</p>
            </div>
            <div className="text-center w-1/3">
              <div className="border-t border-black pt-2 mb-2">
                <p className="font-bold">ZA ZAKUPNIKA</p>
              </div>
              <p className="text-xs text-gray-500">(Potpis i pečat)</p>
            </div>
          </div>

          <div className="text-center mt-12 text-xs text-gray-400">
            Dokument generiran sustavom Riforma •{" "}
            {new Date().toLocaleString("hr-HR")}
          </div>
        </div>
      </>
    );
  },
);

export default HandoverProtocolPrintTemplate;

export const prototypeFixture = {
  seller: { name: "ElektroHome Kft.", slug: "elektrohome-demo" },
  buyers: [
    {
      key: "anna", name: "Kiss Anna", email: "anna.prototype@example.test", pendingOffers: 0,
      history: [
        ["ANNA-01", "Robotporszívó X100", "2023-11-02", 59990], ["HEPA-2", "HEPA szűrő (2 db)", "2024-03-14", 6990],
        ["HEPA-2", "HEPA szűrő (2 db)", "2024-09-20", 6990], ["ANNA-04", "Robotporszívó X200", "2025-04-08", 89990],
        ["FELTORLO", "Feltörlő modul X200", "2025-07-19", 12990], ["HEPA-2", "HEPA szűrő (2 db)", "2025-11-30", 7490],
        ["OLDALKEFE", "Oldalkefe szett X-szériához", "2026-02-11", 3990], ["HEPA-2", "HEPA szűrő (2 db)", "2026-06-30", 7990],
        ["ANNA-09", "Akkumulátor X200-hoz", "2026-08-02", 15990],
      ],
      recommendations: [
        ["HEPA-2", "Három éve rendszeresen vesz szűrőt — az előfizetés mindkét félnek kiszámíthatóbb.", 20],
        ["X200-PRO", "Az X100-ról már váltott egyszer; a Pro modellre váltóknak beszámítást adhatsz.", 15],
      ],
      messages: [
        ["seller", "Tavaszi DM levél kiküldve kuponkóddal (DIRECT-15-KA) — a kupont beváltotta."],
        ["seller", "Személyre szabott ajánlatlista kiküldve — 6 releváns termék."],
        ["buyer", "Jó napot! Az akkumulátor megérkezett, köszönöm a gyors szállítást."],
        ["seller", "Örülünk! Ha bármi kérdés van a beszereléshez, szóljon bátran."],
        ["buyer", "Az ajánlatot elfogadtam, jöhet a szokásos címre."],
      ],
    },
    {
      key: "gabor", name: "Szabó Gábor", email: "gabor.prototype@example.test", pendingOffers: 1,
      history: [
        ["GABOR-01", "Kávédaráló GrindPro", "2024-05-10", 21990], ["BARISTAONE", "Kávéfőző BaristaOne", "2024-12-01", 64990],
        ["GABOR-03", "Kávékapszula variáció (30 db)", "2025-03-03", 4990], ["GABOR-04", "Vízkőmentesítő szett", "2025-06-15", 2990],
        ["GABOR-05", "Kávékapszula variáció (30 db)", "2026-06-03", 4990], ["GABOR-06", "Kávékapszula variáció (30 db)", "2026-07-01", 4990],
        ["GABOR-07", "Vízkőmentesítő szett", "2026-07-28", 2990],
      ],
      recommendations: [["KAPSZULA-60", "Havonta vesz kapszulát — a dupla kiszerelés kedvezménnyel megtartja.", 12]],
      messages: [
        ["buyer", "Sziasztok! A BaristaOne mellé milyen tejhabosítót ajánlotok?"],
        ["seller", "A MilkPro illik hozzá a legjobban — küldök rá ajánlatot!"],
      ],
    },
    {
      key: "reka", name: "Nagy Réka", email: "reka.prototype@example.test", pendingOffers: 0,
      history: [["FITRUN", "Okosóra FitRun", "2026-08-18", 44990], ["REKA-02", "Kijelzővédő fólia FitRun", "2026-08-21", 1990]],
      recommendations: [["FITRUN-SZIJ", "Első vásárlás után kiegészítő termékkel a legkönnyebb visszahozni.", 25]],
      messages: [["seller", "Kedves Réka, megérkezett az okosóra? Minden rendben volt vele?"], ["buyer", "Igen, tökéletes! Köszönöm, hogy rákérdeztek."]],
    },
  ],
  catalog: [
    ["HEPA-2", "HEPA szűrő (2 db)", 7990, "anna", ["ANNA-04"]], ["X200-PRO", "Robotporszívó X200 Pro", 129990, "anna", ["ANNA-01", "ANNA-04"]],
    ["FELTORLO", "Feltörlő modul X200", 12990, "anna", ["ANNA-04"]], ["OLDALKEFE", "Oldalkefe szett X-szériához", 3990, "anna", ["ANNA-04"]],
    ["KAPSZULA-60", "Kávékapszula variáció (60 db)", 8990, "gabor", ["BARISTAONE"]], ["MILKPRO", "MilkPro tejhabosító", 18990, "gabor", ["BARISTAONE"]],
    ["KAVESZETT", "Kávéscsésze szett (6 db)", 8990, "gabor", ["BARISTAONE"]], ["FITRUN-SZIJ", "FitRun sportszíj szett", 9990, "reka", ["FITRUN"]],
    ["FITRUN-2", "Okosóra FitRun 2", 59990, "reka", ["FITRUN"]], ["FITRUN-PULSE", "Pulzusmérő mellkaspánt", 12990, "reka", ["FITRUN"]],
  ],
} as const;

import { BannerNotice, EditorialHero, FeatureBand, GdsIcon, PageHeader, SectionPanel, StatusBadge } from "@discountdirect/gds-client";
import { Shell } from "@/components/shell";

const steps = [
  { id: "understand", title: "Ismerd meg a vásárlóidat", description: "Termékek és vásárlási előzmények egy helyen, a saját ügyfélkapcsolataidhoz kötve.", stepLabel: "01", icon: <GdsIcon name="Users" decorative /> },
  { id: "recommend", title: "Ajánlj személyesen", description: "Érthető ajánlások, amelyek megmutatják, miért lehet releváns egy termék.", stepLabel: "02", icon: <GdsIcon name="Discount" decorative /> },
  { id: "continue", title: "Folytasd a beszélgetést", description: "Ajánlatok és válaszok egy közös történetben, követhető döntésekkel.", stepLabel: "03", icon: <GdsIcon name="Message" decorative /> },
];

export default function Home() {
  return (
    <Shell>
      <PageHeader title="Minden jó ajánlat egy kapcsolattal kezdődik." description="A DiscountDirect összeköti a vásárlási előzményeket, a személyes ajánlatokat és a beszélgetéseket." eyebrow="Áttekintés" actions={<StatusBadge status="success" withIcon>0.8.0 · Mint circuit</StatusBadge>} />
      <EditorialHero
        eyebrow="Az első lépés"
        title="Stabil alapok. Személyesebb kereskedelem."
        description="A termékkatalógus, a vásárlói főkönyv és a hozzájárulás-kezelés már működik. Az üzemeltetői nézetben az adatbázis-kapcsolat és a rendszer állapota is ellenőrizhető."
        actions={[{ label: "Bejelentkezés", href: "/sign-in", variant: "primary" }]}
        meta={[{ id: "theme", label: "GDS 6.7.0 · Mint circuit", icon: <GdsIcon name="Theme" decorative /> }]}
        media={<GdsIcon name="Connectivity" size="xl" decorative />}
        mediaAlt="Kapcsolatok és ajánlatok összekapcsolása"
      />
      <SectionPanel title="A következő fejezetek" description="A fejlesztési terv következő termékfolyamatai." divided={false}>
        <FeatureBand items={steps} columns={3} variant="process" />
      </SectionPanel>
      <BannerNotice variant="compact" severity="info" message="A funkciók kis, ellenőrizhető kiadásokban érkeznek; a vásárlói adatok nem kerülnek nyilvános felületre." />
    </Shell>
  );
}

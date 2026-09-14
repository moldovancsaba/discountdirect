"use client";

import { useMemo, useState } from "react";
import { BannerNotice, Button as GdsButton, Checkbox, GdsIcon, Select as GdsSelect, StatusBadge, Textarea as GdsTextarea } from "@discountdirect/gds-client";

type ViewMode = "seller" | "buyer";
type SellerTab = "chat" | "flash" | "lists";
type BuyerTab = "chat" | "email" | "postal" | "newsletter";
type Channel = "Azonnali üzenet" | "E-mail" | "Mailing";
type OfferStatus = "pending" | "accepted" | "declined";

type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  priceHuf: number;
  stock: number;
  visual: string;
};

type Purchase = {
  id: string;
  product: string;
  detail: string;
  totalHuf: number;
};

type Recommendation = {
  id: string;
  productId: string;
  product: string;
  reason: string;
  score: number;
};

type MessageItem = {
  id: string;
  type: "message";
  from: "seller" | "buyer";
  text: string;
  at: string;
};

type EventItem = {
  id: string;
  type: "event";
  channel: Channel | "Hírlevél";
  text: string;
  at: string;
};

type OfferItem = {
  id: string;
  type: "offer";
  productId: string;
  product: string;
  reason: string;
  originalHuf: number;
  discountPct: number;
  status: OfferStatus;
  channels: Channel[];
  at: string;
  kind: "personal" | "flash";
};

type ThreadItem = MessageItem | EventItem | OfferItem;

type BuyerConversation = {
  id: string;
  name: string;
  initials: string;
  segment: string;
  email: string;
  address: string;
  color: string;
  history: Purchase[];
  recommendations: Recommendation[];
  thread: ThreadItem[];
};

type Automation = {
  id: string;
  title: string;
  cadence: string;
  channels: Channel[];
  products: string[];
  nextRun: string;
  buyers: string[];
};

const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });

const catalog: Product[] = [
  { id: "filter", sku: "HEPA-2", name: "HEPA szűrő, 2 db", category: "Otthon", priceHuf: 7990, stock: 42, visual: "HE" },
  { id: "capsules", sku: "CAP-48", name: "Kávékapszula válogatás", category: "Konyha", priceHuf: 5990, stock: 120, visual: "KA" },
  { id: "hdmi", sku: "HDMI-21", name: "HDMI 2.1 kábel szett", category: "Szórakozás", priceHuf: 5990, stock: 67, visual: "HD" },
  { id: "stand", sku: "RGB-STAND", name: "Headset állvány RGB", category: "Gaming", priceHuf: 7990, stock: 24, visual: "RG" },
  { id: "charger", sku: "PD-65", name: "65W USB-C töltő", category: "Mobil", priceHuf: 12990, stock: 38, visual: "PD" },
  { id: "pods", sku: "POD-CASE", name: "Fülhallgató tok", category: "Mobil", priceHuf: 4990, stock: 75, visual: "FT" },
  { id: "beans", sku: "BEAN-1K", name: "Espresso kávébab, 1 kg", category: "Konyha", priceHuf: 8490, stock: 31, visual: "KB" },
  { id: "cleaner", sku: "VAC-KIT", name: "Robotporszívó karbantartó készlet", category: "Otthon", priceHuf: 9490, stock: 18, visual: "RK" },
];

const initialConversations: BuyerConversation[] = [
  {
    id: "anna",
    name: "Nagy Anna",
    initials: "NA",
    segment: "Törzsvásárló, otthoni gépek",
    email: "anna@example.test",
    address: "1117 Budapest, Példa utca 12.",
    color: "mint",
    history: [
      { id: "a1", product: "Robotporszívó Pro", detail: "2 hónapja, 1 db", totalHuf: 139990 },
      { id: "a2", product: "HEPA szűrő, 2 db", detail: "8 hónapja, 1 db", totalHuf: 7990 },
      { id: "a3", product: "Mikroszálas felmosópad", detail: "11 hónapja, 2 db", totalHuf: 5980 },
    ],
    recommendations: [
      { id: "r-a-filter", productId: "filter", product: "HEPA szűrő, 2 db", reason: "A robotporszívóhoz időszerű cserealkatrész.", score: 98 },
      { id: "r-a-cleaner", productId: "cleaner", product: "Robotporszívó karbantartó készlet", reason: "A korábbi készülékéhez kompatibilis kiegészítő.", score: 91 },
      { id: "r-a-capsules", productId: "capsules", product: "Kávékapszula válogatás", reason: "Gyakran választ háztartási utántöltőket.", score: 73 },
    ],
    thread: [
      { id: "a-msg-1", type: "message", from: "buyer", text: "Szia, a robotporszívóhoz keresek szűrőt.", at: "09:04" },
      { id: "a-offer-1", type: "offer", productId: "filter", product: "HEPA szűrő, 2 db", reason: "Vásárlási előzményei alapján", originalHuf: 7990, discountPct: 15, status: "accepted", channels: ["Azonnali üzenet"], at: "09:06", kind: "personal" },
      { id: "a-event-1", type: "event", channel: "Hírlevél", text: "Személyre szabott ajánlatlista kiküldve, 6 releváns termék.", at: "aug. 1." },
    ],
  },
  {
    id: "gabor",
    name: "Tóth Gábor",
    initials: "TG",
    segment: "Házimozi, kábelek",
    email: "gabor@example.test",
    address: "1024 Budapest, Minta tér 3.",
    color: "amber",
    history: [
      { id: "g1", product: "4K médialejátszó", detail: "3 hete, 1 db", totalHuf: 44990 },
      { id: "g2", product: "Soundbar Mini", detail: "5 hónapja, 1 db", totalHuf: 69990 },
    ],
    recommendations: [
      { id: "r-g-hdmi", productId: "hdmi", product: "HDMI 2.1 kábel szett", reason: "Házimozi-bővítéshez hasznos kiegészítő.", score: 95 },
      { id: "r-g-charger", productId: "charger", product: "65W USB-C töltő", reason: "A médialejátszó mellé gyakran választják.", score: 77 },
    ],
    thread: [
      { id: "g-msg-1", type: "message", from: "seller", text: "A 4K lejátszóhoz a nagy sávszélességű kábel lesz stabil.", at: "múlt hét" },
      { id: "g-offer-1", type: "offer", productId: "hdmi", product: "HDMI 2.1 kábel szett", reason: "Házimozi-bővítéséhez", originalHuf: 5990, discountPct: 20, status: "accepted", channels: ["E-mail"], at: "máj. 30.", kind: "personal" },
    ],
  },
  {
    id: "reka",
    name: "Kiss Réka",
    initials: "KR",
    segment: "Kávé és konyha",
    email: "reka@example.test",
    address: "6720 Szeged, Kávé sor 9.",
    color: "rose",
    history: [
      { id: "r1", product: "Kapszulás kávéfőző", detail: "1 hónapja, 1 db", totalHuf: 32990 },
      { id: "r2", product: "Espresso kávébab, 1 kg", detail: "4 hónapja, 1 db", totalHuf: 8490 },
    ],
    recommendations: [
      { id: "r-r-capsules", productId: "capsules", product: "Kávékapszula válogatás", reason: "A kávéfőzőhöz ismétlődő fogyóeszköz.", score: 97 },
      { id: "r-r-beans", productId: "beans", product: "Espresso kávébab, 1 kg", reason: "Korábban prémium kávét választott.", score: 84 },
    ],
    thread: [
      { id: "r-msg-1", type: "message", from: "buyer", text: "Van most valami kapszula akció?", at: "tegnap" },
      { id: "r-event-1", type: "event", channel: "E-mail", text: "Kávés ajánlat előnézet elküldve e-mailben.", at: "tegnap" },
    ],
  },
  {
    id: "bence",
    name: "Varga Bence",
    initials: "VB",
    segment: "Gaming setup",
    email: "bence@example.test",
    address: "9022 Győr, Pixel köz 5.",
    color: "violet",
    history: [
      { id: "b1", product: "Gaming headset", detail: "2 hete, 1 db", totalHuf: 29990 },
      { id: "b2", product: "Mechanikus billentyűzet", detail: "6 hónapja, 1 db", totalHuf: 39990 },
    ],
    recommendations: [
      { id: "r-b-stand", productId: "stand", product: "Headset állvány RGB", reason: "A gaming headsethez illő kiegészítő.", score: 93 },
      { id: "r-b-hdmi", productId: "hdmi", product: "HDMI 2.1 kábel szett", reason: "Konzolos setuphoz releváns kiegészítő.", score: 72 },
    ],
    thread: [
      { id: "b-offer-1", type: "offer", productId: "stand", product: "Headset állvány RGB", reason: "Setupjához illő kiegészítő", originalHuf: 7990, discountPct: 10, status: "declined", channels: ["Azonnali üzenet"], at: "múlt hét", kind: "personal" },
      { id: "b-msg-1", type: "message", from: "buyer", text: "Most nem, de később jöhet hasonló.", at: "múlt hét" },
    ],
  },
];

const initialAutomations: Automation[] = [
  {
    id: "auto-1",
    title: "Háztartási utánpótlás",
    cadence: "Kéthetente",
    channels: ["E-mail"],
    products: ["HEPA szűrő, 2 db", "Robotporszívó karbantartó készlet"],
    nextRun: "szeptember 28.",
    buyers: ["Nagy Anna"],
  },
];

const channelOptions: Channel[] = ["Azonnali üzenet", "E-mail", "Mailing"];

function discountedPrice(originalHuf: number, discountPct: number) {
  return Math.round(originalHuf * (100 - discountPct) / 100);
}

function productById(productId: string) {
  return catalog.find((product) => product.id === productId) ?? catalog[0];
}

function itemChannels(item: OfferItem) {
  return item.channels.join(" + ");
}

function latestOffer(conversation: BuyerConversation) {
  return [...conversation.thread].reverse().find((item): item is OfferItem => item.type === "offer");
}

function statusLabel(status: OfferStatus, kind: "personal" | "flash") {
  if (kind === "flash") {
    return status === "pending" ? "Válaszra vár" : status === "accepted" ? "Megvásárolva" : "Kihagyva";
  }
  return status === "pending" ? "Válaszra vár" : status === "accepted" ? "Elfogadva" : "Elutasítva";
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

export function OriginalExperienceWorkspace() {
  const [view, setView] = useState<ViewMode>("seller");
  const [sellerTab, setSellerTab] = useState<SellerTab>("chat");
  const [buyerTab, setBuyerTab] = useState<BuyerTab>("chat");
  const [activeId, setActiveId] = useState(initialConversations[0].id);
  const [conversations, setConversations] = useState(initialConversations);
  const [automations, setAutomations] = useState(initialAutomations);
  const [composer, setComposer] = useState("");
  const [notice, setNotice] = useState("Az eredeti DiscountDirect élmény mintadata betöltve.");
  const [flashProductId, setFlashProductId] = useState("filter");
  const [flashDiscount, setFlashDiscount] = useState(20);
  const [flashHours, setFlashHours] = useState(24);
  const [flashQty, setFlashQty] = useState(20);
  const [flashChannels, setFlashChannels] = useState<Channel[]>(["Azonnali üzenet", "E-mail"]);
  const [listProductIds, setListProductIds] = useState<Set<string>>(() => new Set(["filter", "capsules", "hdmi"]));
  const [listCadence, setListCadence] = useState("Kéthetente");
  const [listChannels, setListChannels] = useState<Channel[]>(["E-mail"]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];
  const activeOffer = latestOffer(activeConversation);
  const flashProduct = productById(flashProductId);
  const flashTargets = useMemo(() => {
    return conversations.filter((conversation) => conversation.recommendations.some((recommendation) => recommendation.productId === flashProductId || productById(recommendation.productId).category === flashProduct.category));
  }, [conversations, flashProduct.category, flashProductId]);
  const selectedListProducts = useMemo(() => catalog.filter((product) => listProductIds.has(product.id)), [listProductIds]);
  const listPreview = useMemo(() => {
    return conversations.map((conversation) => {
      const products = selectedListProducts.filter((product) => conversation.recommendations.some((recommendation) => recommendation.productId === product.id || productById(recommendation.productId).category === product.category));
      return { conversation, products };
    });
  }, [conversations, selectedListProducts]);

  function updateConversation(conversationId: string, updater: (conversation: BuyerConversation) => BuyerConversation) {
    setConversations((current) => current.map((conversation) => (conversation.id === conversationId ? updater(conversation) : conversation)));
  }

  function appendToConversation(conversationId: string, item: ThreadItem) {
    updateConversation(conversationId, (conversation) => ({ ...conversation, thread: [...conversation.thread, item] }));
  }

  function sendMessage() {
    const text = composer.trim();
    if (!text) return;
    appendToConversation(activeConversation.id, {
      id: nextId("msg"),
      type: "message",
      from: view,
      text,
      at: "most",
    });
    setComposer("");
    setNotice(view === "seller" ? "Eladói üzenet bekerült a beszélgetésbe." : "Vevői válasz bekerült a beszélgetésbe.");
  }

  function sendRecommendedOffer(recommendation: Recommendation, channel: Channel) {
    const product = productById(recommendation.productId);
    appendToConversation(activeConversation.id, {
      id: nextId("offer"),
      type: "offer",
      productId: product.id,
      product: product.name,
      reason: recommendation.reason,
      originalHuf: product.priceHuf,
      discountPct: 15,
      status: "pending",
      channels: [channel],
      at: "most",
      kind: "personal",
    });
    setNotice(`${activeConversation.name} új személyes ajánlatot kapott: ${product.name}.`);
  }

  function respondToOffer(offerId: string, status: OfferStatus) {
    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      thread: conversation.thread.map((item) => (item.type === "offer" && item.id === offerId ? { ...item, status } : item)),
    }));
    setNotice(status === "accepted" ? "A vevő elfogadta az ajánlatot, kupon/foglalás jöhet létre." : "A vevő elutasította az ajánlatot, a beszélgetés megmarad.");
  }

  function toggleChannel(channel: Channel, selected: Channel[], setSelected: (channels: Channel[]) => void) {
    const next = selected.includes(channel) ? selected.filter((item) => item !== channel) : [...selected, channel];
    setSelected(next.length ? next : [channel]);
  }

  function toggleListProduct(productId: string) {
    setListProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function sendFlashCampaign() {
    const channels: Channel[] = flashChannels.length ? flashChannels : ["Azonnali üzenet"];
    flashTargets.forEach((target) => {
      appendToConversation(target.id, {
        id: nextId(`flash-${target.id}`),
        type: "offer",
        productId: flashProduct.id,
        product: flashProduct.name,
        reason: `${flashHours} órás villámajánlat, legfeljebb ${flashQty} db foglalással.`,
        originalHuf: flashProduct.priceHuf,
        discountPct: flashDiscount,
        status: "pending",
        channels,
        at: "most",
        kind: "flash",
      });
    });
    setNotice(`${flashTargets.length} releváns vevő megkapta a villámajánlatot: ${flashProduct.name}.`);
    if (flashTargets[0]) setActiveId(flashTargets[0].id);
  }

  function createAutomation() {
    if (!selectedListProducts.length) {
      setNotice("Válassz legalább egy terméket az ajánlatlistához.");
      return;
    }
    const buyers = listPreview.filter((row) => row.products.length).map((row) => row.conversation.name);
    const automation: Automation = {
      id: nextId("automation"),
      title: `Ajánlatlista #${automations.length + 1}`,
      cadence: listCadence,
      channels: listChannels,
      products: selectedListProducts.map((product) => product.name),
      nextRun: listCadence === "Hetente" ? "jövő hétfő" : listCadence === "Kéthetente" ? "szeptember 28." : "október 1.",
      buyers,
    };
    setAutomations((current) => [automation, ...current]);
    listPreview.filter((row) => row.products.length).forEach((row) => {
      appendToConversation(row.conversation.id, {
        id: nextId(`list-${row.conversation.id}`),
        type: "event",
        channel: "Hírlevél",
        text: `${automation.title} elkészült, ${row.products.length} releváns termékkel.`,
        at: "most",
      });
    });
    setNotice(`${automation.title} elindult ${buyers.length} vevővel.`);
  }

  function resetDemo() {
    setConversations(initialConversations);
    setAutomations(initialAutomations);
    setActiveId(initialConversations[0].id);
    setNotice("A mintaélmény visszaállt az eredeti állapotra.");
  }

  return (
    <section className="ddx">
      <div className="ddx-topbar">
        <div>
          <p className="ddx-eyebrow">Eredeti wireframe élmény</p>
          <h2>ElektroHome Kft. ajánlási munkatér</h2>
        </div>
      </div>
      <div className="ddx-control-bar">
        <div className="ddx-actions">
          <div className="ddx-switch" aria-label="Nézet váltása">
            <GdsButton type="button" variant={view === "seller" ? "filled" : "default"} leftSection={<GdsIcon name="Users" decorative />} onClick={() => setView("seller")}>Eladó nézet</GdsButton>
            <GdsButton type="button" variant={view === "buyer" ? "filled" : "default"} leftSection={<GdsIcon name="Profile" decorative />} onClick={() => setView("buyer")}>Vevő nézet</GdsButton>
          </div>
          {view === "buyer" ? (
            <GdsSelect
              label="Vevő"
              value={activeId}
              data={conversations.map((conversation) => ({ value: conversation.id, label: conversation.name }))}
              onChange={(value) => value ? setActiveId(value) : undefined}
            />
          ) : null}
          <GdsButton type="button" variant="default" leftSection={<GdsIcon name="Refresh" decorative />} onClick={resetDemo}>Visszaállítás</GdsButton>
        </div>
      </div>

      <div className="ddx-metrics" aria-label="Mintaállapot">
        <div><strong>{conversations.length}</strong><span>vevő</span></div>
        <div><strong>{catalog.length}</strong><span>termék</span></div>
        <div><strong>{conversations.reduce((sum, conversation) => sum + conversation.history.length, 0)}</strong><span>vásárlás</span></div>
        <div><strong>{automations.length}</strong><span>lista</span></div>
      </div>

      <BannerNotice severity="info" variant="compact" message={notice} />

      {view === "seller" ? (
        <>
          <div className="ddx-tabs" role="tablist" aria-label="Eladói funkciók">
            <GdsButton type="button" variant={sellerTab === "chat" ? "filled" : "default"} leftSection={<GdsIcon name="Message" decorative />} onClick={() => setSellerTab("chat")}>Csevegések</GdsButton>
            <GdsButton type="button" variant={sellerTab === "flash" ? "filled" : "default"} leftSection={<GdsIcon name="Discount" decorative />} onClick={() => setSellerTab("flash")}>Villámajánlat</GdsButton>
            <GdsButton type="button" variant={sellerTab === "lists" ? "filled" : "default"} leftSection={<GdsIcon name="List" decorative />} onClick={() => setSellerTab("lists")}>Ajánlatlisták</GdsButton>
          </div>
          {sellerTab === "chat" ? renderSellerChat() : null}
          {sellerTab === "flash" ? renderFlashCampaign() : null}
          {sellerTab === "lists" ? renderOfferLists() : null}
        </>
      ) : (
        <>
          <div className="ddx-tabs" role="tablist" aria-label="Vevői csatornák">
            <GdsButton type="button" variant={buyerTab === "chat" ? "filled" : "default"} leftSection={<GdsIcon name="Message" decorative />} onClick={() => setBuyerTab("chat")}>Csevegés</GdsButton>
            <GdsButton type="button" variant={buyerTab === "email" ? "filled" : "default"} leftSection={<GdsIcon name="Mail" decorative />} onClick={() => setBuyerTab("email")}>E-mail</GdsButton>
            <GdsButton type="button" variant={buyerTab === "postal" ? "filled" : "default"} leftSection={<GdsIcon name="Print" decorative />} onClick={() => setBuyerTab("postal")}>Postai levél</GdsButton>
            <GdsButton type="button" variant={buyerTab === "newsletter" ? "filled" : "default"} leftSection={<GdsIcon name="List" decorative />} onClick={() => setBuyerTab("newsletter")}>Hírlevél</GdsButton>
          </div>
          {buyerTab === "chat" ? renderBuyerChat() : null}
          {buyerTab === "email" ? renderEmailPreview() : null}
          {buyerTab === "postal" ? renderPostalPreview() : null}
          {buyerTab === "newsletter" ? renderNewsletterPreview() : null}
        </>
      )}
    </section>
  );

  function renderConversationList() {
    return (
      <aside className="ddx-card ddx-list-panel" aria-label="Vevők">
        <div className="ddx-panel-head">
          <h3>Vevők</h3>
          <StatusBadge status="info">{conversations.length}</StatusBadge>
        </div>
        <div className="ddx-buyer-list">
          {conversations.map((conversation) => (
            <GdsButton
              key={conversation.id}
              type="button"
              variant={activeId === conversation.id ? "filled" : "default"}
              className="ddx-buyer"
              leftSection={<span className={`ddx-avatar is-${conversation.color}`}>{conversation.initials}</span>}
              onClick={() => setActiveId(conversation.id)}
            >
              <span className="ddx-buyer-copy">
                <strong>{conversation.name}</strong>
                <small>{conversation.segment}</small>
              </span>
            </GdsButton>
          ))}
        </div>
      </aside>
    );
  }

  function renderThread(canRespond: boolean) {
    return (
      <section className="ddx-card ddx-thread-panel">
        <div className="ddx-thread-head">
          <span className={`ddx-avatar is-${activeConversation.color}`}>{activeConversation.initials}</span>
          <div>
            <h3>{activeConversation.name}</h3>
            <p>{activeConversation.segment}</p>
          </div>
        </div>
        <div className="ddx-thread">
          {activeConversation.thread.map((item) => {
            if (item.type === "message") {
              return <div key={item.id} className={`ddx-bubble ${item.from === "seller" ? "from-seller" : "from-buyer"}`}><p>{item.text}</p><span>{item.at}</span></div>;
            }
            if (item.type === "event") {
              return <div key={item.id} className="ddx-event"><strong>{item.channel}</strong><span>{item.text}</span><small>{item.at}</small></div>;
            }
            return (
              <article key={item.id} className={`ddx-offer ${item.kind === "flash" ? "is-flash" : ""}`}>
                <div className="ddx-offer-top">
                  <span>{item.kind === "flash" ? "Villámajánlat" : "Személyes ajánlat"}</span>
                  <StatusBadge status={item.status === "accepted" ? "success" : item.status === "declined" ? "danger" : "warning"}>{statusLabel(item.status, item.kind)}</StatusBadge>
                </div>
                <h4>{item.product}</h4>
                <p>{item.reason}</p>
                <div className="ddx-price-row">
                  <strong>{money.format(discountedPrice(item.originalHuf, item.discountPct))}</strong>
                  <span>{item.discountPct}% kedvezmény</span>
                  <small>{money.format(item.originalHuf)}</small>
                </div>
                <div className="ddx-channel-row">
                  <span>{itemChannels(item)}</span>
                  <small>{item.at}</small>
                </div>
                {canRespond && item.status === "pending" ? (
                  <div className="ddx-inline-actions">
                    <GdsButton type="button" leftSection={<GdsIcon name="Check" decorative />} onClick={() => respondToOffer(item.id, "accepted")}>{item.kind === "flash" ? "Megveszem most" : "Elfogadom"}</GdsButton>
                    <GdsButton type="button" variant="default" leftSection={<GdsIcon name="Close" decorative />} onClick={() => respondToOffer(item.id, "declined")}>{item.kind === "flash" ? "Kihagyom" : "Most nem"}</GdsButton>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        <div className="ddx-composer">
          <GdsTextarea value={composer} minRows={3} maxLength={500} onChange={(event) => setComposer(event.currentTarget.value)} placeholder={view === "seller" ? "Írj üzenetet a vevőnek..." : "Válaszolj az eladónak..."} />
          <GdsButton type="button" leftSection={<GdsIcon name="Send" decorative />} onClick={sendMessage}>Küldés</GdsButton>
        </div>
      </section>
    );
  }

  function renderSellerContext() {
    return (
      <aside className="ddx-card ddx-context">
        <div className="ddx-panel-head">
          <h3>Vásárlási előzmények</h3>
          <StatusBadge status="info">{activeConversation.history.length}</StatusBadge>
        </div>
        <div className="ddx-history">
          {activeConversation.history.map((purchase) => (
            <div key={purchase.id} className="ddx-history-row">
              <strong>{purchase.product}</strong>
              <span>{purchase.detail}</span>
              <small>{money.format(purchase.totalHuf)}</small>
            </div>
          ))}
        </div>
        <div className="ddx-panel-head">
          <h3>Ajánlott ajánlatok</h3>
          <StatusBadge status="success">{activeConversation.recommendations.length}</StatusBadge>
        </div>
        <div className="ddx-rec-list">
          {activeConversation.recommendations.map((recommendation) => {
            const product = productById(recommendation.productId);
            return (
              <article key={recommendation.id} className="ddx-rec">
                <div className="ddx-product-visual">{product.visual}</div>
                <div>
                  <h4>{recommendation.product}</h4>
                  <p>{recommendation.reason}</p>
                  <small>{recommendation.score} pont, {money.format(product.priceHuf)}</small>
                </div>
                <div className="ddx-channel-buttons">
                  <GdsButton type="button" size="xs" variant="default" onClick={() => sendRecommendedOffer(recommendation, "Azonnali üzenet")}>Üzenet</GdsButton>
                  <GdsButton type="button" size="xs" variant="default" onClick={() => sendRecommendedOffer(recommendation, "E-mail")}>E-mail</GdsButton>
                  <GdsButton type="button" size="xs" variant="default" onClick={() => sendRecommendedOffer(recommendation, "Mailing")}>Levél</GdsButton>
                </div>
              </article>
            );
          })}
        </div>
      </aside>
    );
  }

  function renderSellerChat() {
    return (
      <div className="ddx-workspace">
        {renderConversationList()}
        {renderThread(false)}
        {renderSellerContext()}
      </div>
    );
  }

  function renderBuyerChat() {
    return (
      <div className="ddx-buyer-workspace">
        {renderThread(true)}
        <aside className="ddx-card ddx-context">
          <div className="ddx-panel-head">
            <h3>Ajánlati állapot</h3>
            <StatusBadge status={activeOffer?.status === "accepted" ? "success" : activeOffer?.status === "declined" ? "danger" : "warning"}>{activeOffer ? statusLabel(activeOffer.status, activeOffer.kind) : "Nincs ajánlat"}</StatusBadge>
          </div>
          {activeOffer ? (
            <article className="ddx-channel-preview-card">
              <h4>{activeOffer.product}</h4>
              <p>{activeOffer.reason}</p>
              <strong>{money.format(discountedPrice(activeOffer.originalHuf, activeOffer.discountPct))}</strong>
              <span>{itemChannels(activeOffer)}</span>
            </article>
          ) : null}
        </aside>
      </div>
    );
  }

  function renderFlashCampaign() {
    return (
      <div className="ddx-campaign-grid">
        <section className="ddx-card">
          <div className="ddx-panel-head">
            <h3>Villámajánlat összeállítása</h3>
            <StatusBadge status="warning">24 órás ritmus</StatusBadge>
          </div>
          <div className="ddx-product-grid">
            {catalog.map((product) => (
              <GdsButton
                key={product.id}
                type="button"
                variant={flashProductId === product.id ? "filled" : "default"}
                className="ddx-product-option"
                leftSection={<span className="ddx-product-visual">{product.visual}</span>}
                onClick={() => setFlashProductId(product.id)}
              >
                <span className="ddx-product-copy">
                  <strong>{product.name}</strong>
                  <small>{product.stock} db, {money.format(product.priceHuf)}</small>
                </span>
              </GdsButton>
            ))}
          </div>
          <div className="ddx-control-grid">
            <GdsSelect label="Kedvezmény" value={String(flashDiscount)} data={[10, 15, 20, 25, 30].map((value) => ({ value: String(value), label: `${value}%` }))} onChange={(value) => value ? setFlashDiscount(Number(value)) : undefined} />
            <GdsSelect label="Időablak" value={String(flashHours)} data={[6, 24, 48].map((value) => ({ value: String(value), label: `${value} óra` }))} onChange={(value) => value ? setFlashHours(Number(value)) : undefined} />
            <GdsSelect label="Mennyiség" value={String(flashQty)} data={[10, 20, 50].map((value) => ({ value: String(value), label: `${value} db` }))} onChange={(value) => value ? setFlashQty(Number(value)) : undefined} />
          </div>
          <div className="ddx-check-row">
            {channelOptions.map((channel) => (
              <Checkbox key={channel} label={channel} checked={flashChannels.includes(channel)} onChange={() => toggleChannel(channel, flashChannels, setFlashChannels)} />
            ))}
          </div>
          <GdsButton type="button" leftSection={<GdsIcon name="Send" decorative />} onClick={sendFlashCampaign}>Küldés a releváns vevőknek</GdsButton>
        </section>
        <section className="ddx-card">
          <div className="ddx-panel-head">
            <h3>Célcsoport és előnézet</h3>
            <StatusBadge status="info">{flashTargets.length} vevő</StatusBadge>
          </div>
          <div className="ddx-targets">
            {flashTargets.map((target) => (
              <div key={target.id} className="ddx-target-row">
                <span className={`ddx-avatar is-${target.color}`}>{target.initials}</span>
                <div>
                  <strong>{target.name}</strong>
                  <small>{target.recommendations.find((recommendation) => recommendation.productId === flashProduct.id)?.reason ?? `${flashProduct.category} kategóriában releváns.`}</small>
                </div>
              </div>
            ))}
          </div>
          <article className="ddx-offer is-flash preview">
            <div className="ddx-offer-top">
              <span>Villámajánlat előnézet</span>
              <StatusBadge status="warning">{flashHours} óra</StatusBadge>
            </div>
            <h4>{flashProduct.name}</h4>
            <p>{flashQty} db-ig foglalható a releváns vevőknek.</p>
            <div className="ddx-price-row">
              <strong>{money.format(discountedPrice(flashProduct.priceHuf, flashDiscount))}</strong>
              <span>{flashDiscount}% kedvezmény</span>
              <small>{flashChannels.join(" + ")}</small>
            </div>
          </article>
        </section>
      </div>
    );
  }

  function renderOfferLists() {
    return (
      <div className="ddx-campaign-grid">
        <section className="ddx-card">
          <div className="ddx-panel-head">
            <h3>Új ajánlatlista</h3>
            <StatusBadge status="success">{selectedListProducts.length} termék</StatusBadge>
          </div>
          <div className="ddx-product-grid">
            {catalog.map((product) => (
              <GdsButton
                key={product.id}
                type="button"
                variant={listProductIds.has(product.id) ? "filled" : "default"}
                className="ddx-product-option"
                leftSection={<span className="ddx-product-visual">{product.visual}</span>}
                onClick={() => toggleListProduct(product.id)}
              >
                <span className="ddx-product-copy">
                  <strong>{product.name}</strong>
                  <small>{product.category}, {money.format(product.priceHuf)}</small>
                </span>
              </GdsButton>
            ))}
          </div>
          <div className="ddx-control-grid">
            <GdsSelect label="Gyakoriság" value={listCadence} data={["Hetente", "Kéthetente", "Havonta"].map((value) => ({ value, label: value }))} onChange={(value) => value ? setListCadence(value) : undefined} />
          </div>
          <div className="ddx-check-row">
            {channelOptions.map((channel) => (
              <Checkbox key={channel} label={channel} checked={listChannels.includes(channel)} onChange={() => toggleChannel(channel, listChannels, setListChannels)} />
            ))}
          </div>
          <GdsButton type="button" leftSection={<GdsIcon name="Calendar" decorative />} onClick={createAutomation}>Automatikus küldés indítása</GdsButton>
        </section>
        <section className="ddx-card">
          <div className="ddx-panel-head">
            <h3>Vevőnkénti előnézet</h3>
            <StatusBadge status="info">{listPreview.filter((row) => row.products.length).length} érintett</StatusBadge>
          </div>
          <div className="ddx-preview-list">
            {listPreview.map((row) => (
              <div key={row.conversation.id} className="ddx-preview-row">
                <strong>{row.conversation.name}</strong>
                <span>{row.products.length ? row.products.map((product) => product.name).join(", ") : "Nincs releváns termék ebben a listában."}</span>
              </div>
            ))}
          </div>
          <div className="ddx-panel-head">
            <h3>Futó listák</h3>
            <StatusBadge status="success">{automations.length}</StatusBadge>
          </div>
          <div className="ddx-automation-list">
            {automations.map((automation) => (
              <article key={automation.id} className="ddx-automation">
                <h4>{automation.title}</h4>
                <p>{automation.cadence}, következő küldés: {automation.nextRun}</p>
                <span>{automation.channels.join(" + ")}</span>
                <small>{automation.buyers.join(", ") || "Nincs címzett"}</small>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderEmailPreview() {
    if (!activeOffer) return renderNoChannelPreview("E-mail");
    return (
      <section className="ddx-channel-frame">
        <article className="ddx-email">
          <p className="ddx-eyebrow">ElektroHome Kft.</p>
          <h3>{activeConversation.name}, ezt Önnek válogattuk</h3>
          <p>{activeOffer.reason}</p>
          <div className="ddx-email-offer">
            <div className="ddx-product-visual">{productById(activeOffer.productId).visual}</div>
            <div>
              <h4>{activeOffer.product}</h4>
              <strong>{money.format(discountedPrice(activeOffer.originalHuf, activeOffer.discountPct))}</strong>
              <span>{activeOffer.discountPct}% kedvezmény, {statusLabel(activeOffer.status, activeOffer.kind)}</span>
            </div>
          </div>
          <p className="ddx-footer-copy">Válaszoljon erre az e-mailre, és az üzenet megjelenik a DiscountDirect beszélgetésben.</p>
        </article>
      </section>
    );
  }

  function renderPostalPreview() {
    if (!activeOffer) return renderNoChannelPreview("Postai levél");
    return (
      <section className="ddx-channel-frame">
        <article className="ddx-letter">
          <div className="ddx-address">
            <strong>{activeConversation.name}</strong>
            <span>{activeConversation.address}</span>
          </div>
          <h3>Személyes ajánlat az ElektroHome-tól</h3>
          <p>Korábbi vásárlásai alapján a következő terméket ajánljuk figyelmébe.</p>
          <div className="ddx-letter-offer">
            <strong>{activeOffer.product}</strong>
            <span>{money.format(discountedPrice(activeOffer.originalHuf, activeOffer.discountPct))}</span>
            <small>Kuponkód: DD-{activeConversation.initials}-{activeOffer.discountPct}</small>
          </div>
          <p>A levél mintanézet, a tényleges postázást a kézbesítési napló igazolja.</p>
        </article>
      </section>
    );
  }

  function renderNewsletterPreview() {
    const matchingAutomation = automations.find((automation) => automation.buyers.includes(activeConversation.name)) ?? automations[0];
    const products = matchingAutomation?.products ?? activeConversation.recommendations.map((recommendation) => recommendation.product);
    return (
      <section className="ddx-channel-frame">
        <article className="ddx-newsletter">
          <p className="ddx-eyebrow">ElektroHome személyre szabott ajánlatlista</p>
          <h3>{activeConversation.name}, aktuális válogatás</h3>
          <div className="ddx-news-grid">
            {products.slice(0, 6).map((name) => {
              const product = catalog.find((item) => item.name === name) ?? productById(activeConversation.recommendations[0]?.productId ?? "filter");
              return (
                <div key={name} className="ddx-news-product">
                  <span className="ddx-product-visual">{product.visual}</span>
                  <strong>{name}</strong>
                  <small>{money.format(product.priceHuf)}</small>
                </div>
              );
            })}
          </div>
          <p className="ddx-footer-copy">{matchingAutomation?.cadence ?? "Kéthetente"} érkezik, a korábbi rendelések alapján.</p>
        </article>
      </section>
    );
  }

  function renderNoChannelPreview(channel: string) {
    return (
      <section className="ddx-channel-frame">
        <article className="ddx-empty-channel">
          <GdsIcon name="Preview" decorative />
          <h3>{channel} előnézet</h3>
          <p>Ehhez a vevőhöz először küldj ajánlatot az eladói csevegésből vagy a villámajánlatból.</p>
        </article>
      </section>
    );
  }
}

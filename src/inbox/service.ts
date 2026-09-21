import "server-only";
import { buyerOfferLists } from "@/automations/service";
import { buyerInbox } from "@/messaging/service";
import { buyerOffers } from "@/offers/service";
export async function buyerMarketplaceInbox(userId: string, cursor?: string | null) { const conversations = await buyerInbox(userId, cursor); const [offers, lists] = await Promise.all([buyerOffers(userId), buyerOfferLists(userId)]); const selected = conversations.preference.mode === "per_seller" ? conversations.preference.sellerId : null; return { preference: conversations.preference, preferenceRecovered: conversations.preferenceRecovered, sellers: conversations.sellers, conversations: conversations.conversations, nextCursor: conversations.nextCursor, offers: selected ? offers.offers.filter((row) => row.sellerId === selected) : offers.offers, lists: selected ? lists.lists.filter((row) => row.sellerId === selected) : lists.lists }; }

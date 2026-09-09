# Conversations

Release 1.0.0 introduces seller-scoped, durable conversations between a seller and a buyer with an active relationship. A seller opens a conversation only from a customer record whose normalized e-mail belongs to an active local buyer account in the same seller scope. The resulting seller/buyer pair is unique, so opening the same conversation again returns the existing thread.

`ConversationEvent` keeps both messages and non-chat activity in one chronological timeline. A system `conversation_opened` event is created with the conversation. Messages carry a caller-provided `clientRequestId`, unique per sender and conversation; retries return the original message and do not raise unread counts twice. Events use `createdAt` then `_id` ordering and every list endpoint provides an opaque cursor for older pages.

The seller inbox requires an active membership for its exact seller slug. The buyer inbox only shows rows matching the authenticated buyer and an active buyer relationship. Thread reads and writes apply those same checks, clear the reader's unread counter, and never trust an identifier supplied by the browser to establish a tenant scope. The current pending-offer count is deliberately zero because offers have not been released.

Available routes are `GET /api/sellers/{sellerSlug}/conversations`, `POST /api/sellers/{sellerSlug}/customers/{customerId}/conversations`, `GET /api/conversations`, and `GET`/`POST /api/conversations/{conversationId}/messages`. Cookie-authenticated writes require same-origin JSON requests. There are no attachments, external synchronization, notifications, or real-time transport in this release.

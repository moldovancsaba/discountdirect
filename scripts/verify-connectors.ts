import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { Membership, Seller, User } from "../src/auth/models.ts";
import type { CommerceConnector } from "../src/connectors/contracts.ts";
import { ConnectorInstallation, ConnectorRecord, ConnectorRun, connectorModels } from "../src/connectors/models.ts";
import { syncConnector } from "../src/connectors/service.ts";

const uri=process.env.MONGODB_URI;if(!uri) throw new Error("MONGODB_URI is required");
const databaseName=`dd_connector_verify_${randomBytes(5).toString("hex")}`;
if(!databaseName.startsWith("dd_connector_verify_")) throw new Error("Unsafe verification database name");
process.env.MONGODB_DB=databaseName;
await mongoose.connect(uri,{dbName:databaseName,serverSelectionTimeoutMS:5000,autoIndex:false});
const fake:CommerceConnector={provider:"shoprenter",async testConnection(){},async listProducts(cursor){return cursor?{items:[],nextCursor:null}:{items:[{providerId:"provider-1",sku:"SKU-1",name:"Teszt termék",priceHuf:12990,active:true,updatedAt:new Date("2026-09-20T10:00:00Z")}],nextCursor:"1"};},async listOrders(){return{items:[],nextCursor:null};},async getStock(){return[];},async createCheckout(){return{url:"https://shop.example/product",providerReference:"test"};}};
try{
  for(const model of connectorModels) await model.createIndexes();
  const user=await User.create({emailNormalized:"connector.verify@example.invalid",displayName:"Connector Verify",status:"active"});
  const seller=await Seller.create({name:"Connector Verify",slug:"connector-verify",status:"active"});
  await Membership.create({sellerId:seller._id,userId:user._id,role:"owner",status:"active"});
  await ConnectorInstallation.create({sellerId:seller._id,provider:"shoprenter",status:"healthy",credentialRef:"VERIFY_CONNECTOR_SECRET",configuration:{shopName:"verify",shopUrl:"https://shop.example/",checkoutUrlTemplate:"https://shop.example/search?q={sku}"},createdByUserId:user._id,updatedByUserId:user._id});
  const first=await syncConnector(user._id.toString(),seller.slug,{provider:"shoprenter",kind:"catalog_sync",expectedVersion:1,idempotencyKey:"verify:catalog:page:1"},{connector:fake});
  assert.equal(first.replayed,false);assert.equal(await ConnectorRecord.countDocuments({sellerId:seller._id}),1);assert.equal((await ConnectorInstallation.findOne({sellerId:seller._id}).lean())?.cursors?.catalog_sync,"1");
  const replay=await syncConnector(user._id.toString(),seller.slug,{provider:"shoprenter",kind:"catalog_sync",expectedVersion:2,idempotencyKey:"verify:catalog:page:1"},{connector:fake});
  assert.equal(replay.replayed,true);assert.equal(await ConnectorRun.countDocuments({sellerId:seller._id}),1);assert.equal(await ConnectorRecord.countDocuments({sellerId:seller._id}),1);
  await ConnectorRun.create({sellerId:seller._id,installationId:(await ConnectorInstallation.findOne({sellerId:seller._id}).lean())?._id,kind:"catalog_sync",idempotencyKey:"verify:catalog:retry:1",status:"retryable_failed",attempt:1,startedAt:new Date(Date.now()-120_000),finishedAt:new Date(Date.now()-60_000),nextAttemptAt:new Date(Date.now()-1_000),cursorBefore:"1",errorCode:"TIMEOUT"});
  const retry=await syncConnector(user._id.toString(),seller.slug,{provider:"shoprenter",kind:"catalog_sync",expectedVersion:2,idempotencyKey:"verify:catalog:retry:1"},{connector:fake});assert.equal(retry.replayed,false);assert.equal((await ConnectorRun.findOne({sellerId:seller._id,idempotencyKey:"verify:catalog:retry:1"}).lean())?.attempt,2);
  const outsider=await User.create({emailNormalized:"connector.outsider@example.invalid",displayName:"Connector Outsider",status:"active"});await assert.rejects(()=>syncConnector(outsider._id.toString(),seller.slug,{provider:"shoprenter",kind:"catalog_sync",expectedVersion:3,idempotencyKey:"verify:forbidden:1"},{connector:fake}),/FORBIDDEN/);
  console.log(JSON.stringify({database:databaseName,runs:2,records:1,cursor:null,idempotentReplay:true,retryRecovered:true,crossTenantDenied:true}));
}finally{for(const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});await mongoose.disconnect();}

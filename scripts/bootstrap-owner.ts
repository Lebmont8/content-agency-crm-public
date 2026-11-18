import {readFileSync} from "node:fs";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
async function main() {
 const url=new URL(process.env.DATABASE_URL??"");
 if(process.env.PUBLIC_EDITION_BOOTSTRAP!=="1"||!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||!url.pathname.endsWith("_public"))throw new Error("Bootstrap requires a loopback _public database and explicit PUBLIC_EDITION_BOOTSTRAP=1");
 const data=JSON.parse(readFileSync(0,"utf8")) as {email:string;name:string;password:string;agency:string;slug:string};
 if(!data.email.includes("@")||data.password.length<16||!data.agency.trim()||!/^[a-z0-9-]{3,60}$/.test(data.slug))throw new Error("Invalid local bootstrap input");
 const db=new PrismaClient();
 try {
  if(await db.user.count())throw new Error("Bootstrap refuses an existing user database");
  const passwordHash=await bcrypt.hash(data.password,12);
  await db.agency.create({data:{name:data.agency,slug:data.slug,commissionAssistPercent:0,commissionAutoPercent:0,perModelFeeCents:0,users:{create:{email:data.email.toLowerCase(),name:data.name,passwordHash,role:"OWNER",isPlatformAdmin:false}}}});
  console.log("Local owner created; credentials not displayed.");
 } finally {await db.$disconnect();}
}
main().catch(()=>{console.error("Local bootstrap failed; verify isolated database, input and explicit bootstrap gate.");process.exitCode=1;});

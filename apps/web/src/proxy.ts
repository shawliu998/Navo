import { NextRequest, NextResponse } from "next/server";
export function proxy(request:NextRequest){if(request.nextUrl.pathname.startsWith("/app")&&request.cookies.get("navo_session")?.value!=="demo-owner"){const url=new URL("/login",request.url);url.searchParams.set("next",request.nextUrl.pathname);return NextResponse.redirect(url)}return NextResponse.next()}
export const config={matcher:["/app/:path*"]};

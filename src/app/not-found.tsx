import Link from "next/link";
import { Shell } from "@/components/shell";
export default function NotFound() {
  return (
    <Shell>
      <p className="eyebrow">404</p>
      <h1>Ez az oldal nem található.</h1>
      <p className="lead">
        A keresett oldal nem létezik, vagy másik címre költözött.
      </p>
      <Link className="button" href="/">
        Vissza az áttekintéshez
      </Link>
    </Shell>
  );
}

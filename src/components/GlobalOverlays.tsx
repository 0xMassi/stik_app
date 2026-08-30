import { Toaster } from "sonner";
import CommandMenu from "./CommandMenu";

export default function GlobalOverlays() {
  return (
    <>
      <CommandMenu />
      <Toaster
        position="bottom-center"
        toastOptions={{ className: "text-[12px]" }}
      />
    </>
  );
}

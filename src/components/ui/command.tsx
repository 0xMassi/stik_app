import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";

/// shadcn-style Command primitives, trimmed to what Stik uses.
///
/// Stik does not otherwise use shadcn, so rather than pull the whole registry
/// this wraps cmdk directly with the same component names and Tailwind tokens
/// the rest of the app uses.

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={`flex h-full w-full flex-col overflow-hidden rounded-xl bg-bg text-ink ${className}`}
    {...props}
  />
));
Command.displayName = "Command";

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className = "", ...props }, ref) => (
  <div className="flex items-center border-b border-line px-3">
    <CommandPrimitive.Input
      ref={ref}
      className={`flex h-11 w-full bg-transparent py-3 text-[14px] text-ink outline-none placeholder:text-stone disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  </div>
));
CommandInput.displayName = "CommandInput";

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={`max-h-[300px] overflow-y-auto overflow-x-hidden py-1 ${className}`}
    {...props}
  />
));
CommandList.displayName = "CommandList";

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="px-4 py-4 text-center text-[12px] text-stone"
    {...props}
  />
));
CommandEmpty.displayName = "CommandEmpty";

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={`overflow-hidden p-1 text-ink ${className}`}
    {...props}
  />
));
CommandGroup.displayName = "CommandGroup";

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={`relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-[13px] outline-none data-[selected=true]:bg-coral-light data-[selected=true]:text-coral data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 ${className}`}
    {...props}
  />
));
CommandItem.displayName = "CommandItem";

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  children: React.ReactNode;
}

/// Lightweight dialog wrapper. Radix's Dialog would be the shadcn default, but
/// Stik already renders its own overlays and adding Radix for one surface is
/// more dependency than this needs.
function CommandDialog({ open, onOpenChange, label, children }: CommandDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center pt-[18vh]">
      <button
        type="button"
        aria-label={label}
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative w-[min(90vw,420px)] overflow-hidden rounded-xl border border-line bg-bg shadow-stik"
      >
        <Command
          loop
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onOpenChange(false);
            }
          }}
        >
          {children}
        </Command>
      </div>
    </div>
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
};

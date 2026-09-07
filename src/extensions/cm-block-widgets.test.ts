import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@/i18n";
import {
  createImageWidgetDom,
  isRemoteImageSource,
  refreshBlockWidgetLabels,
} from "./cm-block-widgets";

afterEach(() => setLocale("en"));

describe("image widget privacy", () => {
  it.each(["", "User-provided alt text"])("refreshes image failure labels but preserves user alt %j", (alt) => {
    const root = document.createElement("div");
    const widget = createImageWidgetDom("data:image/png;base64,invalid", alt, false);
    root.append(widget);
    widget.querySelector("img")!.dispatchEvent(new Event("error"));
    const fallback = widget.querySelector(".cm-image-error-text")!;
    expect(fallback).toHaveTextContent(alt || "Image failed to load");
    setLocale("zh-CN");
    refreshBlockWidgetLabels(root);
    expect(fallback).toHaveTextContent(alt || "图片加载失败");
    expect(widget.querySelector("img")).toBeNull();
  });

  it("does not assign an HTTP image source before explicit consent", () => {
    const widget = createImageWidgetDom(
      "https://tracking.example/pixel.png",
      "diagram",
      false,
    );

    expect(widget.querySelector("img")).toBeNull();
    expect(widget.textContent).toContain("tracking.example");
    const loadButton = widget.querySelector("button");
    expect(loadButton).not.toBeNull();

    loadButton?.click();

    expect(widget.querySelector("img")?.getAttribute("src")).toBe(
      "https://tracking.example/pixel.png",
    );
  });

  it("renders remote images immediately after persistent consent", () => {
    const widget = createImageWidgetDom(
      "https://images.example/photo.webp",
      "photo",
      true,
    );

    expect(widget.querySelector("button")).toBeNull();
    expect(widget.querySelector("img")?.getAttribute("src")).toBe(
      "https://images.example/photo.webp",
    );
  });

  it.each([
    "data:image/png;base64,abc",
    "https://asset.localhost/Users/me/Stik/.assets/local.png",
    "asset://localhost/Users/me/Stik/.assets/legacy.png",
  ])("renders trusted local source %s without a prompt", (source) => {
    const widget = createImageWidgetDom(source, "local", false);

    expect(widget.querySelector("button")).toBeNull();
    expect(widget.querySelector("img")?.getAttribute("src")).toBe(source);
  });

  it("classifies only network HTTP(S) sources as remote", () => {
    expect(isRemoteImageSource("http://example.com/image.png")).toBe(true);
    expect(isRemoteImageSource("https://example.com/image.png")).toBe(true);
    expect(isRemoteImageSource("//example.com/image.png")).toBe(true);
    expect(isRemoteImageSource("https://asset.localhost/image.png")).toBe(
      false,
    );
    expect(isRemoteImageSource("data:image/png;base64,abc")).toBe(false);
  });
});

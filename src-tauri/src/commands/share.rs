use base64::Engine;
use pulldown_cmark::{html, Options, Parser};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
#[cfg(target_os = "macos")]
use std::ptr::NonNull;

#[cfg(target_os = "macos")]
use objc2::runtime::AnyObject;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRepPropertyKey, NSView};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSData, NSDictionary, NSUInteger};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardPayload {
    pub plain_text: String,
    pub html: String,
}

#[tauri::command]
pub fn build_clipboard_payload(markdown: String) -> Result<ClipboardPayload, String> {
    Ok(ClipboardPayload {
        plain_text: markdown.clone(),
        html: markdown_to_html(&markdown),
    })
}

#[tauri::command]
pub fn copy_rich_text_to_clipboard(html: String, plain_text: String) -> Result<(), String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("Clipboard unavailable: {e}"))?;
    clipboard
        .set_html(&html, Some(&plain_text))
        .map_err(|e| format!("Failed to write rich text to clipboard: {e}"))
}

#[tauri::command]
pub fn copy_note_image_to_clipboard(png_base64: String) -> Result<(), String> {
    let decoded_bytes = base64::engine::general_purpose::STANDARD
        .decode(&png_base64)
        .map_err(|e| format!("Invalid image payload: {e}"))?;
    copy_png_bytes_to_clipboard(&decoded_bytes)
}

#[tauri::command]
pub fn copy_visible_note_image_to_clipboard(
    webview_window: tauri::WebviewWindow,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::sync::mpsc;
        use std::time::Duration;

        let (sender, receiver) = mpsc::channel();
        webview_window
            .with_webview(move |webview| {
                let result = unsafe { capture_webview_png_bytes(webview) };
                let _ = sender.send(result);
            })
            .map_err(|e| format!("Failed to access webview: {e}"))?;

        let png_bytes = receiver
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| "Timed out while capturing note image".to_string())??;
        copy_png_bytes_to_clipboard(&png_bytes)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = webview_window;
        Err("Image snapshot copy is currently supported on macOS only".to_string())
    }
}

fn copy_png_bytes_to_clipboard(png_bytes: &[u8]) -> Result<(), String> {
    let image = image::load_from_memory_with_format(png_bytes, image::ImageFormat::Png)
        .map_err(|e| format!("Invalid PNG image: {e}"))?
        .to_rgba8();

    let (width, height) = image.dimensions();
    let pixels = image.into_raw();

    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("Clipboard unavailable: {e}"))?;

    clipboard
        .set_image(arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: Cow::Owned(pixels),
        })
        .map_err(|e| format!("Failed to write image to clipboard: {e}"))
}

fn markdown_to_html(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(markdown, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

#[cfg(target_os = "macos")]
unsafe fn capture_webview_png_bytes(
    webview: tauri::webview::PlatformWebview,
) -> Result<Vec<u8>, String> {
    let view: &NSView = unsafe { &*webview.inner().cast() };
    let bounds = view.bounds();
    view.viewWillDraw();

    let bitmap_rep = view
        .bitmapImageRepForCachingDisplayInRect(bounds)
        .ok_or_else(|| "Failed to create bitmap snapshot".to_string())?;
    view.cacheDisplayInRect_toBitmapImageRep(bounds, &bitmap_rep);

    let properties = NSDictionary::<NSBitmapImageRepPropertyKey, AnyObject>::dictionary();
    let png_data = unsafe {
        bitmap_rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
    }
    .ok_or_else(|| "Failed to encode snapshot as PNG".to_string())?;

    Ok(ns_data_to_vec(&png_data))
}

#[cfg(target_os = "macos")]
fn ns_data_to_vec(data: &NSData) -> Vec<u8> {
    let length = data.length() as usize;
    let mut buffer = vec![0_u8; length];
    if length > 0 {
        let ptr = NonNull::new(buffer.as_mut_ptr().cast::<c_void>())
            .expect("vector pointer is never null");
        unsafe {
            data.getBytes_length(ptr, length as NSUInteger);
        }
    }
    buffer
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_heading_and_paragraph() {
        let html = markdown_to_html("# Title\n\nhello world");
        assert!(html.contains("<h1>Title</h1>"));
        assert!(html.contains("<p>hello world</p>"));
    }

    #[test]
    fn renders_basic_inline_markdown() {
        let html = markdown_to_html("This has **bold**, *italic*, and `code`.");
        assert!(html.contains("<strong>bold</strong>"));
        assert!(html.contains("<em>italic</em>"));
        assert!(html.contains("<code>code</code>"));
    }

    #[test]
    fn renders_unordered_list_items() {
        let html = markdown_to_html("- one\n- two");
        assert!(html.contains("<ul>"));
        assert!(html.contains("<li>one</li>"));
        assert!(html.contains("<li>two</li>"));
        assert!(html.contains("</ul>"));
    }

    #[test]
    fn decodes_valid_png_base64() {
        let expected_pixels = vec![255_u8, 0, 0, 255];
        let mut png_bytes = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
        image::ImageEncoder::write_image(
            encoder,
            &expected_pixels,
            1,
            1,
            image::ColorType::Rgba8.into(),
        )
        .unwrap();

        let png_base64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
        let decoded_bytes = base64::engine::general_purpose::STANDARD
            .decode(&png_base64)
            .unwrap();
        let decoded_image = image::load_from_memory_with_format(&decoded_bytes, image::ImageFormat::Png)
            .unwrap()
            .to_rgba8();
        let (width, height) = decoded_image.dimensions();
        let pixels = decoded_image.into_raw();

        assert_eq!(width, 1);
        assert_eq!(height, 1);
        assert_eq!(pixels.len(), 4);
        assert_eq!(pixels, expected_pixels);
    }

    #[test]
    fn fails_on_invalid_png_base64() {
        let decoded = base64::engine::general_purpose::STANDARD.decode("not-valid-base64");
        assert!(decoded.is_err());
    }
}

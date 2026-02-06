use pulldown_cmark::{html, Options, Parser};
use serde::{Deserialize, Serialize};

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
}

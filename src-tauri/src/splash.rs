// Splash screen shown immediately while the Node sidecar boots.
// Logo is baked into the binary via include_bytes! so there is no file I/O at launch.

use crate::base64_encode_bytes;

const LOGO_PNG: &[u8] = include_bytes!("../icons/128x128@2x.png");

pub fn data_url() -> String {
    let html = html();
    format!(
        "data:text/html;charset=utf-8;base64,{}",
        base64_encode_bytes(html.as_bytes())
    )
}

fn html() -> String {
    format!(
        r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Claude Usage Dashboard</title>
<style>
  html, body {{
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #0a0a0a;
    color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    user-select: none;
    -webkit-user-select: none;
  }}
  .logo {{
    width: 128px;
    height: 128px;
    image-rendering: -webkit-optimize-contrast;
    animation: pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }}
  .label {{
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    letter-spacing: 0.02em;
    animation: fadeInOut 2.4s ease-in-out infinite;
  }}
  @keyframes pulse {{
    0%, 100% {{ opacity: 1; transform: scale(1); }}
    50%      {{ opacity: 0.72; transform: scale(0.97); }}
  }}
  @keyframes fadeInOut {{
    0%, 100% {{ opacity: 0.6; }}
    50%      {{ opacity: 1; }}
  }}
</style>
</head>
<body>
  <img class="logo" src="data:image/png;base64,{logo}" alt="" />
  <div class="label">Starting…</div>
</body>
</html>"#,
        logo = base64_encode_bytes(LOGO_PNG)
    )
}

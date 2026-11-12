package app.mawadda.android;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String LOCAL_SERVER = "http://127.0.0.1:3001";
    private static final String LOCAL_SETUP = "على الكمبيوتر شغّل npm run dev:android من مجلد commercial، ثم وصّل الهاتف وشغّل adb reverse tcp:3001 tcp:3004.";
    private static final int IVORY = Color.rgb(248, 245, 236);
    private static final int GREEN = Color.rgb(35, 79, 62);
    private WebView page;
    private URI server;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(GREEN);
        getWindow().setNavigationBarColor(GREEN);
        String saved = getPreferences(MODE_PRIVATE).getString("server", "");
        if (saved.isEmpty()) showSetup("");
        else connect(saved);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void showSetup(String message) {
        destroyPage();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(IVORY);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        form.setGravity(Gravity.CENTER_VERTICAL);
        form.setPadding(dp(26), dp(24), dp(26), dp(24));
        scroll.addView(form);

        TextView title = new TextView(this);
        title.setText("مَوَدّة");
        title.setTextColor(GREEN);
        title.setTextSize(36);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        form.addView(title);

        TextView description = new TextView(this);
        description.setText("حسابك وجلسات التعارف على أندرويد");
        description.setTextSize(18);
        description.setPadding(0, 0, 0, dp(24));
        form.addView(description);

        EditText address = new EditText(this);
        address.setId(View.generateViewId());
        address.setSingleLine(true);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setTextDirection(View.TEXT_DIRECTION_LTR);
        address.setText(getPreferences(MODE_PRIVATE).getString("server", LOCAL_SERVER));
        TextView label = new TextView(this);
        label.setText("عنوان خادم مَوَدّة");
        label.setLabelFor(address.getId());
        form.addView(label);
        form.addView(address);

        Button open = new Button(this);
        open.setText("فتح مَوَدّة");
        open.setTextColor(Color.WHITE);
        open.setBackgroundTintList(android.content.res.ColorStateList.valueOf(GREEN));
        open.setOnClickListener(view -> connect(address.getText().toString()));
        form.addView(open);

        TextView info = new TextView(this);
        info.setText(message.isEmpty() ? LOCAL_SETUP : message);
        info.setPadding(0, dp(14), 0, 0);
        if (!message.isEmpty()) info.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        form.addView(info);
        setContentView(scroll);
    }

    private void connect(String address) {
        try {
            URI parsed = new URI(address.trim());
            String host = parsed.getHost();
            String scheme = parsed.getScheme() == null ? "" : parsed.getScheme().toLowerCase(Locale.ROOT);
            boolean allowed = "https".equals(scheme) || ("http".equals(scheme) && "127.0.0.1".equals(host));
            if (host == null || !allowed || parsed.getUserInfo() != null || parsed.getQuery() != null || parsed.getFragment() != null || parsed.getPort() > 65535) {
                showSetup("أدخل عنوان HTTPS أو عنوان المعاينة المحلية 127.0.0.1.");
                return;
            }
            server = new URI(scheme, null, host, parsed.getPort(), null, null, null);
        } catch (URISyntaxException error) {
            showSetup("عنوان الخادم غير صالح.");
            return;
        }

        destroyPage();
        getPreferences(MODE_PRIVATE).edit().putString("server", server.toString()).apply();
        page = new WebView(this);
        page.setBackgroundColor(IVORY);
        WebSettings settings = page.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        page.setWebChromeClient(new WebChromeClient());
        page.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && !sameOrigin(request.getUrl());
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) fail(view, connectionMessage("تعذّر الاتصال بخادم مَوَدّة."));
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) fail(view, connectionMessage("تعذّر فتح إصدار أندرويد من هذا الخادم."));
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                fail(view, "تعذّر التحقق من الاتصال الآمن بالخادم.");
            }
        });
        setContentView(page);
        page.loadUrl(server.toString() + "/android/");
    }

    private String connectionMessage(String message) {
        return message + "\n\n" + (LOCAL_SERVER.equals(server.toString()) ? LOCAL_SETUP : "تحقّق من عنوان خادم مَوَدّة وأنه يفتح مسار /android/.");
    }

    private boolean sameOrigin(Uri target) {
        int defaultPort = "https".equals(server.getScheme()) ? 443 : 80;
        int sourcePort = server.getPort() < 0 ? defaultPort : server.getPort();
        int targetPort = target.getPort() < 0 ? defaultPort : target.getPort();
        return server.getScheme().equalsIgnoreCase(target.getScheme()) && server.getHost().equalsIgnoreCase(target.getHost())
            && sourcePort == targetPort && target.getUserInfo() == null;
    }

    private void fail(WebView failedPage, String message) {
        failedPage.post(() -> { if (page == failedPage) showSetup(message); });
    }

    @Override public void onBackPressed() {
        if (page == null) super.onBackPressed();
        else if (page.canGoBack()) page.goBack();
        else showSetup("");
    }

    private void destroyPage() {
        if (page == null) return;
        page.stopLoading();
        if (page.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) page.getParent()).removeView(page);
        page.destroy();
        page = null;
    }

    @Override protected void onDestroy() {
        destroyPage();
        super.onDestroy();
    }
}

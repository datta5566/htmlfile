package com.dk.pdiscanner;

import android.app.Activity;
import android.app.PrintManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 2102;
    private static final String LOCAL_ORIGIN = "https://appassets.androidplatform.net/";
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private GmsBarcodeScanner nativeScanner;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();
        configureNativeScanner();
        configureWebView();
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(7, 17, 38));
        window.setNavigationBarColor(Color.rgb(5, 10, 19));
    }

    private void configureNativeScanner() {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE, Barcode.FORMAT_DATA_MATRIX)
                .enableAutoZoom()
                .build();
        nativeScanner = GmsBarcodeScanning.getClient(this, options);
    }

    @SuppressWarnings("SetJavaScriptEnabled")
    private void configureWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 17, 38));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " DKPDI-Android/1.1");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternalUri(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalUri(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "File picker नहीं खुला।", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.loadUrl(LOCAL_ORIGIN + "assets/index.html");
    }

    private boolean handleExternalUri(Uri uri) {
        String url = uri.toString();
        if (url.startsWith(LOCAL_ORIGIN)) return false;

        try {
            if (url.startsWith("intent://")) {
                Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                startActivity(intent);
                return true;
            }

            String scheme = uri.getScheme();
            if ("http".equalsIgnoreCase(scheme)
                    || "https".equalsIgnoreCase(scheme)
                    || "market".equalsIgnoreCase(scheme)) {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        } catch (Exception error) {
            Toast.makeText(this, "Link नहीं खुली।", Toast.LENGTH_SHORT).show();
            return true;
        }

        return true;
    }

    private void startNativeScanner() {
        runOnUiThread(() -> nativeScanner.startScan()
                .addOnSuccessListener(barcode -> {
                    String value = barcode.getRawValue();
                    if (value == null || value.trim().isEmpty()) {
                        sendScannerError("QR data खाली मिला।");
                        return;
                    }
                    vibrateSuccess();
                    String jsValue = org.json.JSONObject.quote(value);
                    webView.evaluateJavascript("window.dkHandleNativeScan(" + jsValue + ")", null);
                })
                .addOnCanceledListener(() -> sendScannerError("Scanner बंद किया गया।"))
                .addOnFailureListener(error -> sendScannerError(
                        "Camera scanner error: " + (error.getMessage() == null ? "Google scanner module check करें।" : error.getMessage()))));
    }

    private void vibrateSuccess() {
        Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(90, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibrator.vibrate(90);
        }
    }

    private void sendScannerError(String message) {
        runOnUiThread(() -> webView.evaluateJavascript(
                "window.dkNativeScannerError(" + org.json.JSONObject.quote(message) + ")", null));
    }

    private void openKnestfs() {
        runOnUiThread(() -> {
            Intent launch = getPackageManager().getLaunchIntentForPackage("com.knestfs");
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(launch);
            } else {
                openKnestfsStore();
            }
        });
    }

    private void openKnestfsStore() {
        runOnUiThread(() -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.knestfs")));
            } catch (Exception error) {
                startActivity(new Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://play.google.com/store/apps/details?id=com.knestfs")));
            }
        });
    }

    private void saveBase64File(String filename, String base64Data, String mimeType) {
        runOnUiThread(() -> {
            try {
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                String cleanName = filename.replaceAll("[\\\\/:*?\"<>|]", "_");

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, cleanName);
                    values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/DK_PDI");
                    ContentResolver resolver = getContentResolver();
                    Uri savedUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (savedUri == null) throw new IllegalStateException("Download location unavailable");
                    try (OutputStream stream = resolver.openOutputStream(savedUri)) {
                        if (stream == null) throw new IllegalStateException("File stream unavailable");
                        stream.write(bytes);
                    }
                } else {
                    File directory = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "DK_PDI");
                    if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Folder create failed");
                    try (OutputStream stream = new FileOutputStream(new File(directory, cleanName))) {
                        stream.write(bytes);
                    }
                }

                Toast.makeText(this, "Saved: Downloads/DK_PDI/" + cleanName, Toast.LENGTH_LONG).show();
            } catch (Exception error) {
                Toast.makeText(this, "Save failed: " + error.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    private void printCurrentPage() {
        runOnUiThread(() -> {
            PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
            printManager.print("DK PDI Report", webView.createPrintDocumentAdapter("DK PDI Report"), null);
        });
    }

    public class AndroidBridge {
        @JavascriptInterface public void startNativeScanner() { MainActivity.this.startNativeScanner(); }
        @JavascriptInterface public void openKnestfs() { MainActivity.this.openKnestfs(); }
        @JavascriptInterface public void openKnestfsStore() { MainActivity.this.openKnestfsStore(); }
        @JavascriptInterface public void saveBase64File(String filename, String data, String mimeType) {
            MainActivity.this.saveBase64File(filename, data, mimeType);
        }
        @JavascriptInterface public void printCurrentPage() { MainActivity.this.printCurrentPage(); }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("Android");
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

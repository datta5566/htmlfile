package com.dk.pdiscanner;

import android.Manifest;
import android.app.Activity;
import android.app.PrintManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int CAMERA_PERMISSION_REQUEST = 2101;
    private static final int FILE_CHOOSER_REQUEST = 2102;
    private WebView webView;
    private PermissionRequest pendingPermissionRequest;
    private ValueCallback<Uri[]> fileChooserCallback;
    private GmsBarcodeScanner nativeScanner;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();
        configureWebView();
        configureNativeScanner();
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
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString() + " DKPDI-Android/1.0");

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
                Uri uri = request.getUrl();
                String url = uri.toString();
                if (url.startsWith("https://appassets.androidplatform.net/")) return false;
                if (url.startsWith("intent://")) {
                    try {
                        startActivity(Intent.parseUri(url, Intent.URI_INTENT_SCHEME));
                    } catch (Exception error) {
                        Toast.makeText(MainActivity.this, "Target app नहीं खुली।", Toast.LENGTH_SHORT).show();
                    }
                    return true;
                }
                if (url.startsWith("market://") || url.contains("play.google.com/store/apps")) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                            && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                        pendingPermissionRequest = request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
                        return;
                    }
                    request.grant(request.getResources());
                });
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = filePathCallback;
                Intent chooser = fileChooserParams.createIntent();
                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "File picker नहीं खुला।", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private void startNativeScanner() {
        runOnUiThread(() -> nativeScanner.startScan()
                .addOnSuccessListener(barcode -> {
                    String value = barcode.getRawValue();
                    if (value == null || value.trim().isEmpty()) {
                        sendScannerError("QR data खाली मिला।");
                        return;
                    }
                    String jsValue = org.json.JSONObject.quote(value);
                    webView.evaluateJavascript("window.dkHandleNativeScan(" + jsValue + ")", null);
                })
                .addOnCanceledListener(() -> sendScannerError("Scanner बंद किया गया।"))
                .addOnFailureListener(error -> sendScannerError("Camera scanner error: " + error.getMessage())));
    }

    private void sendScannerError(String message) {
        runOnUiThread(() -> webView.evaluateJavascript(
                "window.dkNativeScannerError(" + org.json.JSONObject.quote(message) + ")", null));
    }

    private void openKnestfs() {
        runOnUiThread(() -> {
            Intent launch = getPackageManager().getLaunchIntentForPackage("com.knestfs");
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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
                OutputStream stream;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, cleanName);
                    values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/DK_PDI");
                    ContentResolver resolver = getContentResolver();
                    Uri savedUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (savedUri == null) throw new IllegalStateException("Download location unavailable");
                    stream = resolver.openOutputStream(savedUri);
                } else {
                    File directory = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "DK_PDI");
                    if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Folder create failed");
                    File output = new File(directory, cleanName);
                    stream = new FileOutputStream(output);
                }

                if (stream == null) throw new IllegalStateException("File stream unavailable");
                stream.write(bytes);
                stream.flush();
                stream.close();
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
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST && pendingPermissionRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
            } else {
                pendingPermissionRequest.deny();
            }
            pendingPermissionRequest = null;
        }
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
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }
}

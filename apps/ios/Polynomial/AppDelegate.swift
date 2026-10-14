import UIKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = UINavigationController(rootViewController: ServerController())
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
final class ServerController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    let web: WKWebView = {
        let config = WKWebViewConfiguration()
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        config.applicationNameForUserAgent = "PolynomialClient/\(version) (ios; arm64)"
        return WKWebView(frame: .zero, configuration: config)
    }()
    var server = URL(string: UserDefaults.standard.string(forKey: "server") ?? "https://polynomial-server.tail722ac8.ts.net")!
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Polynomial"
        view.backgroundColor = .systemBackground
        web.navigationDelegate = self; web.uiDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        web.allowsBackForwardNavigationGestures = true
        view.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), web.bottomAnchor.constraint(equalTo: view.bottomAnchor), web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        navigationItem.leftBarButtonItem = UIBarButtonItem(image: UIImage(systemName: "chevron.left"), style: .plain, target: self, action: #selector(back))
        navigationItem.rightBarButtonItems = [UIBarButtonItem(image: UIImage(systemName: "gearshape"), style: .plain, target: self, action: #selector(settings)), UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(reload))]
        home()
    }
    func home() { web.load(URLRequest(url: server.appendingPathComponent("app.html"))) }
    @objc func back() { if web.canGoBack { web.goBack() } else { home() } }
    @objc func reload() { web.reload() }
    @objc func settings() {
        let alert = UIAlertController(title: "连接设置", message: "请保持 Tailscale 连接。只接受 HTTPS 服务器地址。", preferredStyle: .alert)
        alert.addTextField { $0.text = self.server.absoluteString; $0.keyboardType = .URL; $0.autocapitalizationType = .none; $0.autocorrectionType = .no }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "连接", style: .default) { _ in
            guard let text = alert.textFields?.first?.text, let url = URL(string: text), url.scheme == "https", url.host != nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else { self.showError("请输入完整的 HTTPS 服务器地址，不含路径和参数。"); return }
            self.server = url
            UserDefaults.standard.set(url.absoluteString, forKey: "server")
            self.home()
        })
        present(alert, animated: true)
    }
    func sameServer(_ url: URL) -> Bool { url.scheme == "https" && url.host == server.host && url.port == server.port && url.user == nil }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if sameServer(url) { decisionHandler(.allow); return }
        if navigationAction.targetFrame?.isMainFrame != false && ["https", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, sameServer(url) { webView.load(navigationAction.request) }
        return nil
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError("无法连接服务器。请检查网络或 Tailscale，然后点击刷新重试。") }
    }
    func showError(_ message: String) { let alert = UIAlertController(title: "Polynomial", message: message, preferredStyle: .alert); alert.addAction(UIAlertAction(title: "确定", style: .default)); if presentedViewController == nil { present(alert, animated: true) } }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "Polynomial", message: message, preferredStyle: .alert); alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler() }); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "Polynomial", message: message, preferredStyle: .alert); alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) }); alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler(true) }); present(alert, animated: true)
    }
}

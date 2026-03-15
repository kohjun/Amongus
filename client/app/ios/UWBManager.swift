// ios/UWBManager.swift

import NearbyInteraction
import CoreBluetooth
import React

@objc(UWBManager)
class UWBManager: RCTEventEmitter, NISessionDelegate, CBCentralManagerDelegate, CBPeripheralManagerDelegate {

  // ── UWB ──────────────────────────────────────────────
  var niSessions:     [String: NISession] = [:]   // { peerId: NISession }
  var peerTokens:     [String: NIDiscoveryToken] = [:]
  var myToken:        NIDiscoveryToken?

  // ── BLE ──────────────────────────────────────────────
  var centralManager:    CBCentralManager?
  var peripheralManager: CBPeripheralManager?
  var discoveredRSSI:    [String: Int] = [:]  // { deviceId: RSSI }

  // ── 지원 이벤트 목록 ──────────────────────────────────
  override func supportedEvents() -> [String]! {
    return [
      "onMyTokenReady",       // 내 UWB 토큰 생성 완료
      "onProximityUpdate",    // 거리/방향 업데이트
      "onBLEDiscovered",      // BLE 기기 발견
    ]
  }

  // ── UWB 초기화 ────────────────────────────────────────
  @objc func initUWB() {
    let session = NISession()
    session.delegate = self
    myToken = session.discoveryToken

    guard let token = myToken,
          let tokenData = try? NSKeyedArchiver.archivedData(
            withRootObject: token,
            requiringSecureCoding: true
          ) else { return }

    // React Native로 내 토큰 전달
    sendEvent(
      withName: "onMyTokenReady",
      body: ["token": tokenData.base64EncodedString()]
    )
  }

  // ── 상대방 토큰 수신 후 세션 시작 ────────────────────
  @objc func startSession(_ peerId: String, tokenBase64: String) {
    guard let tokenData = Data(base64Encoded: tokenBase64),
          let peerToken = try? NSKeyedUnarchiver.unarchivedObject(
            ofClass: NIDiscoveryToken.self,
            from: tokenData
          ) else { return }

    let session = NISession()
    session.delegate = self
    niSessions[peerId] = session
    peerTokens[peerId] = peerToken

    let config = NINearbyPeerConfiguration(peerToken: peerToken)
    session.run(config)
    print("[UWB] 세션 시작: \(peerId)")
  }

  // ── NISessionDelegate ─────────────────────────────────
  func session(_ session: NISession, didUpdate objects: [NINearbyObject]) {
    for obj in objects {
      // 어떤 peerId의 세션인지 찾기
      guard let peerId = niSessions.first(where: { $0.value === session })?.key else { continue }

      var body: [String: Any] = [
        "peerId":  peerId,
        "method":  "uwb",
      ]

      if let distance = obj.distance {
        body["distance"] = distance
      }
      if let direction = obj.direction {
        body["direction"] = [
          "x": direction.x,
          "y": direction.y,
          "z": direction.z,
        ]
      }

      sendEvent(withName: "onProximityUpdate", body: body)
    }
  }

  func session(_ session: NISession, didInvalidateWith error: Error) {
    print("[UWB] 세션 무효화: \(error.localizedDescription)")
    // 해당 세션 제거 후 BLE로 폴백
    if let peerId = niSessions.first(where: { $0.value === session })?.key {
      niSessions.removeValue(forKey: peerId)
      startBLEFallback(peerId)
    }
  }

  // ── BLE 폴백 ──────────────────────────────────────────
  @objc func startBLEScan() {
    centralManager = CBCentralManager(delegate: self, queue: nil)
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      central.scanForPeripherals(withServices: nil, options: [
        CBCentralManagerScanOptionAllowDuplicatesKey: true  // RSSI 실시간 갱신
      ])
    }
  }

  func centralManager(_ central: CBCentralManager,
                       didDiscover peripheral: CBPeripheral,
                       advertisementData: [String: Any],
                       rssi RSSI: NSNumber) {

    let deviceId = peripheral.identifier.uuidString
    let rssi     = RSSI.intValue

    // RSSI → 거리 변환 (환경상수 2.0, 기준점 -59 dBm @ 1m)
    let distance = pow(10.0, Double(-59 - rssi) / (10.0 * 2.0))

    sendEvent(withName: "onProximityUpdate", body: [
      "peerId":   deviceId,
      "distance": distance,
      "method":   "ble",
      "rssi":     rssi,
    ])
  }

  func startBLEFallback(_ peerId: String) {
    print("[BLE] \(peerId) UWB 실패 → BLE 폴백")
    if centralManager == nil {
      startBLEScan()
    }
  }

  // ── 세션 종료 ─────────────────────────────────────────
  @objc func stopSession(_ peerId: String) {
    niSessions[peerId]?.invalidate()
    niSessions.removeValue(forKey: peerId)
    peerTokens.removeValue(forKey: peerId)
  }

  @objc func stopAll() {
    niSessions.values.forEach { $0.invalidate() }
    niSessions.removeAll()
    centralManager?.stopScan()
  }

  // ── React Native 브릿지 등록 ──────────────────────────
  @objc static override func requiresMainQueueSetup() -> Bool { return false }
}
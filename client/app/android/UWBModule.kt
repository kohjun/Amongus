// android/app/src/main/java/com/amongus/UWBModule.kt

package com.amongus

import androidx.core.uwb.*
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.bluetooth.le.*
import android.bluetooth.*
import kotlin.math.pow

class UWBModule(private val reactContext: ReactApplicationContext)
  : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "UWBManager"

  private var uwbManager: UwbManager? = null
  private var controleeSession: UwbClientSessionScope? = null
  private var bleScanner: BluetoothLeScanner? = null

  // ── UWB 초기화 ────────────────────────────────────────
  @ReactMethod
  fun initUWB(promise: Promise) {
    try {
      uwbManager = reactContext.getSystemService(UwbManager::class.java)

      // 로컬 주소 획득
      val address = uwbManager?.localAddress?.address ?: run {
        promise.reject("UWB_UNAVAILABLE", "UWB를 지원하지 않는 기기입니다.")
        startBLEScan()  // BLE 폴백
        return
      }

      promise.resolve(address.joinToString(",") { it.toString() })
    } catch (e: Exception) {
      promise.reject("UWB_ERROR", e.message)
      startBLEScan()
    }
  }

  // ── UWB 세션 시작 ─────────────────────────────────────
  @ReactMethod
  fun startSession(peerId: String, peerAddress: String, promise: Promise) {
    try {
      val addressBytes = peerAddress.split(",").map { it.toByte() }.toByteArray()
      val uwbAddress   = UwbAddress(addressBytes)

      val sessionScope = uwbManager?.controleeSessionScope() ?: run {
        promise.reject("NO_SESSION", "세션 생성 실패")
        return
      }

      val config = RangingParameters(
        uwbConfigType       = RangingParameters.CONFIG_UNICAST_DS_TWR,
        sessionId           = peerId.hashCode(),
        sessionKeyInfo      = null,
        complexChannel      = null,
        peerDevices         = listOf(UwbDevice(uwbAddress)),
        updateRateType      = RangingParameters.RANGING_UPDATE_RATE_FREQUENT,
      )

      // 코루틴으로 ranging 결과 수신
      sessionScope.prepareSession(config).collect { result ->
        when (result) {
          is RangingResult.RangingResultPosition -> {
            val distance  = result.position.distance?.value ?: return@collect
            val azimuth   = result.position.azimuth?.value
            val elevation = result.position.elevation?.value

            val body = Arguments.createMap().apply {
              putString("peerId",   peerId)
              putDouble("distance", distance.toDouble())
              putString("method",   "uwb")
              azimuth?.let   { putDouble("azimuth",   it.toDouble()) }
              elevation?.let { putDouble("elevation", it.toDouble()) }
            }

            sendEvent("onProximityUpdate", body)
          }
          else -> {}
        }
      }

      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SESSION_ERROR", e.message)
    }
  }

  // ── BLE 폴백 ──────────────────────────────────────────
  @ReactMethod
  fun startBLEScan() {
    val bluetoothManager = reactContext.getSystemService(BluetoothManager::class.java)
    bleScanner = bluetoothManager?.adapter?.bluetoothLeScanner

    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val rssi     = result.rssi
        val deviceId = result.device.address

        // RSSI → 거리 추정
        val distance = 10.0.pow((-59 - rssi) / (10.0 * 2.0))

        val body = Arguments.createMap().apply {
          putString("peerId",   deviceId)
          putDouble("distance", distance)
          putString("method",   "ble")
          putInt("rssi",        rssi)
        }

        sendEvent("onProximityUpdate", body)
      }
    }

    bleScanner?.startScan(callback)
  }

  // ── React Native 이벤트 전송 ──────────────────────────
  private fun sendEvent(name: String, body: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, body)
  }

  @ReactMethod
  fun stopAll() {
    bleScanner?.stopScan(null)
    controleeSession = null
  }
}
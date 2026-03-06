// ios/UWBManager.m - 브릿지 등록

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(UWBManager, RCTEventEmitter)
RCT_EXTERN_METHOD(initUWB)
RCT_EXTERN_METHOD(startSession:(NSString *)peerId tokenBase64:(NSString *)tokenBase64)
RCT_EXTERN_METHOD(stopSession:(NSString *)peerId)
RCT_EXTERN_METHOD(startBLEScan)
RCT_EXTERN_METHOD(stopAll)
@end
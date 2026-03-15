// src/auth/firebaseAdmin.js
// Firebase Admin SDK 초기화 (서버 전역 싱글톤)
//
// 준비 사항:
//   Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
//   다운받은 JSON 파일을 프로젝트 루트에 firebase-service-account.json 으로 저장
//   .gitignore에 반드시 추가할 것

'use strict';

const admin = require('firebase-admin');

// 이미 초기화된 경우 중복 초기화 방지 (모듈 캐싱으로 보통 안 일어나지만 안전장치)
if (!admin.apps.length) {
  const serviceAccount = require('../../firebase-service-account.json');

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // Firestore 사용을 위해 projectId 명시
    projectId: serviceAccount.project_id,
  });

  console.log('[Firebase] Admin SDK 초기화 완료');
}

// Firestore 인스턴스 (auth 모듈 외부에서도 사용)
const db = admin.firestore();

module.exports = { admin, db };
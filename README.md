# 출항 관제실 · 조건식 통합하기

마틴 파울러의 **Consolidate Conditional Expression**을 항구 출항 결정으로 배우는 한국어 인터랙티브 튜토리얼입니다. 강풍, 짙은 안개, 항로 폐쇄가 각각 같은 `대기` 결론을 내리는 상황을 다룹니다.

[공개 튜토리얼](https://technoetic.github.io/consolidate-conditional-expression/) · [파울러의 리팩터링 카탈로그](https://refactoring.com/catalog/consolidateConditionalExpression.html)

| 단계 | 실습 |
| --- | --- |
| [신호 관찰](https://technoetic.github.io/consolidate-conditional-expression/#/observe) | 세 신호를 켜고 끄며 어느 조건에서 함수가 반환하는지 추적합니다. |
| [조건 묶기](https://technoetic.github.io/consolidate-conditional-expression/#/combine) | `shouldHold`에 OR 또는 AND를 적용해 선택한 항구 상태에서 기존 코드와 비교합니다. |
| [결과 검증](https://technoetic.github.io/consolidate-conditional-expression/#/verify) | 세 신호로 가능한 여덟 조합을 모두 실행해 동작을 보존하는지 확인합니다. |

세 입력은 값을 읽기만 하는 불리언입니다. 실제 코드에서 조건을 평가하며 값을 바꾸거나 로그를 쓴다면 결과와 함께 평가 순서와 호출 횟수도 점검합니다.

## 로컬 실행

Node.js 24에서 별도 패키지 설치 없이 실행합니다.

```sh
npm test
npm run build
npm start
```

로컬 주소는 `http://127.0.0.1:8917/consolidate-conditional-expression/`입니다. 선택한 신호와 연산자는 현재 탭에 저장됩니다. GitHub Actions가 `main`의 테스트와 빌드를 마치면 GitHub Pages에 게시합니다.

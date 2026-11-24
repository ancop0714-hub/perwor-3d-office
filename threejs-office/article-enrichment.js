(function attachPerworArticleEnrichment(global) {
  'use strict';

  const MISSING_TRANSLATION = '해당 문장의 한국어 해석을 준비 중입니다.';
  const MISSING_SUMMARY = '기사 본문 정보를 확인할 수 없어 핵심 요약을 제공하지 못했습니다.';

  // These are article-specific enrichments for the licensed BBC items currently
  // returned by the content API. The key matches the title or exact passage;
  // it never substitutes a different article's translation or summary.
  const knownArticles = [
    {
      match: /poundland hopeful for last-minute rescue deal/i,
      translationKo: 'BBC가 파악한 바에 따르면, 법정관리 절차에 가까워지고 있는 이 할인 소매업체는 매수자를 찾을 수 있도록 더 많은 시간을 부여받게 될 전망이다.',
      summaryKo: '영국 할인 소매업체 파운드랜드가 경영 위기 속에서 법정관리 가능성을 피하고 매수자를 찾기 위해 추가 시간을 확보할 것으로 보인다.',
    },
    {
      match: /The BBC understands the discount chain, which has been edging towards administration/i,
      translationKo: 'BBC가 파악한 바에 따르면, 법정관리 절차에 가까워지고 있는 이 할인 소매업체는 매수자를 찾을 수 있도록 더 많은 시간을 부여받게 될 전망이다.',
      summaryKo: '영국 할인 소매업체 파운드랜드가 경영 위기 속에서 법정관리 가능성을 피하고 매수자를 찾기 위해 추가 시간을 확보할 것으로 보인다.',
    },
    {
      match: /stickers and building sets help drive toy sales/i,
      translationKo: '올해 장난감 판매가 호조를 보이는 가운데, 화면 사용 시간과 기술 연결성에 대한 논쟁도 더욱 거세지고 있다.',
      summaryKo: '크리스마스 성수기를 앞두고 스티커와 조립식 장난감 판매가 늘면서 장난감 시장이 호조를 보이고 있지만, 아동의 화면 사용과 기술 연결을 둘러싼 논쟁도 커지고 있다.',
    },
    {
      match: /Nvidia hires major US law firm/i,
      translationKo: '엔비디아는 중국 스파이로 추정되는 여성과의 관계 의혹을 조사하기 위해 미국의 대형 로펌을 선임했다.',
      summaryKo: '엔비디아가 젠슨 황과 중국 스파이로 추정되는 여성의 관계 의혹이 불거진 뒤, 관련 사실을 조사하기 위해 미국의 대형 로펌을 고용했다.',
    },
    {
      match: /Claude chatbot maker set for .* stock market debut/i,
      translationKo: '클로드 챗봇을 만든 AI 기업은 주당 70~78달러에 주식을 공모할 예정이며, 이는 당초 예상보다 낮은 가격이다.',
      summaryKo: '클로드 챗봇 개발사가 당초 예상보다 낮은 주당 70~78달러의 공모가를 제시하며 기업공개를 추진하고 있다.',
    },
    {
      match: /Sales of tinned food and bottled water jump/i,
      translationKo: '정부가 가정에 비상사태에 대비하라고 촉구한 뒤 손 세정제 같은 생필품 판매가 급증했다.',
      summaryKo: '정부의 비상 대비 캠페인 이후 손 세정제 등 필수품 판매가 크게 늘어 소비자들의 대비 수요가 증가했다.',
    },
  ];

  const genericPhrases = [
    '기술과 디지털 산업의 최근 변화에 관한 글로벌 소식입니다.',
    '기업과 시장의 최근 변화에 관한 글로벌 소식입니다.',
    '기업 활동과 시장 변화의 주요 흐름을 전하고, 관련된 경제적 영향을 설명합니다.',
    '기술·디지털 산업의 최신 변화와 기업 및 소비자에게 미치는 영향을 정리합니다.',
    '최근 국제 동향과 주요 영향을 정리한 기사입니다.',
  ];

  function isGeneric(value) {
    const text = String(value || '').trim();
    if (!text) return true;
    if (genericPhrases.includes(text)) return true;
    return /^“.*”에 관한 최신 글로벌 소식입니다\.$/.test(text) || /^“.*”를 중심으로 최근 국제 동향/.test(text);
  }

  function find(article) {
    const haystack = `${article?.title || ''} ${article?.text || ''}`;
    return knownArticles.find(item => item.match.test(haystack)) || null;
  }

  function normalize(article) {
    if (!article) return article;
    const known = find(article);
    if (known) return { ...article, translationKo: known.translationKo, summaryKo: known.summaryKo };
    return {
      ...article,
      translationKo: isGeneric(article.translationKo) ? '' : article.translationKo,
      summaryKo: isGeneric(article.summaryKo) ? '' : article.summaryKo,
    };
  }

  global.PerworArticleEnrichment = {
    normalize,
    missingTranslation: MISSING_TRANSLATION,
    missingSummary: MISSING_SUMMARY,
  };
})(window);

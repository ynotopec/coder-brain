const normalize = (input) => String(input || '').trim();

const isCapitalOfFranceQuestion = (input) => {
  const text = normalize(input).toLowerCase();
  return /\b(qu[’']?elle? est la capitale de la france|what is the capital of france)\b/i.test(text);
};

const isNameQuestion = (input) => {
  const text = normalize(input);
  return /\b(quel est ton nom|ton nom|tu t['’]appelles comment|who are you|what('?s| is) your name)\b/i.test(text);
};

const isLikelyFrench = (input) => {
  const text = normalize(input).toLowerCase();
  return /[àâçéèêëîïôûùüÿœ]|\b(quoi|quel|quelle|bonjour|salut|merci|france|capitale)\b/i.test(text);
};

export const buildLocalChatReply = (input) => {
  const safeInput = normalize(input);
  const french = isLikelyFrench(safeInput);

  if (isCapitalOfFranceQuestion(safeInput)) {
    return {
      message: french ? 'La capitale de la France est Paris.' : 'The capital of France is Paris.',
      engagement_level: 'medium',
      topic_continuation: french ? ['géographie', 'culture française'] : ['geography', 'french culture'],
      sentiment: 'positive'
    };
  }

  if (isNameQuestion(safeInput)) {
    return {
      message: french ? 'Je m\'appelle Coder Brain.' : 'My name is Coder Brain.',
      engagement_level: 'medium',
      topic_continuation: french ? ['présentation'] : ['introduction'],
      sentiment: 'positive'
    };
  }

  return {
    message: french
      ? `J'ai bien reçu : "${safeInput}". Que veux-tu faire ensuite ?`
      : `I received: "${safeInput}". What would you like to do next?`,
    engagement_level: 'medium',
    topic_continuation: french ? ['aide', 'objectif'] : ['help', 'goal'],
    sentiment: 'positive'
  };
};

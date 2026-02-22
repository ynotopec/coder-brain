const form = document.getElementById('queryForm');
const input = document.getElementById('userInput');
const responseText = document.getElementById('responseText');
const statusTag = document.getElementById('statusTag');
const sendButton = document.getElementById('sendButton');
const toggleAdvanced = document.getElementById('toggleAdvanced');
const advancedPanel = document.getElementById('advancedPanel');
const showMetadata = document.getElementById('showMetadata');
const metadataDetails = document.getElementById('metadataDetails');
const metadataBlock = document.getElementById('metadataBlock');

const setLoading = (isLoading) => {
  sendButton.disabled = isLoading;
  sendButton.textContent = isLoading ? 'Traitement…' : 'Envoyer';
  statusTag.textContent = isLoading ? 'Analyse en cours' : 'Prêt';
};

toggleAdvanced.addEventListener('click', () => {
  const isExpanded = toggleAdvanced.getAttribute('aria-expanded') === 'true';
  toggleAdvanced.setAttribute('aria-expanded', String(!isExpanded));
  advancedPanel.hidden = isExpanded;
});

showMetadata.addEventListener('change', () => {
  metadataDetails.hidden = !showMetadata.checked;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const rawInput = input.value.trim();
  if (!rawInput) {
    responseText.textContent = 'Merci de saisir une demande.';
    responseText.classList.remove('muted');
    return;
  }

  setLoading(true);
  responseText.classList.add('muted');
  responseText.textContent = 'Génération de la réponse…';

  try {
    const result = await fetch('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: rawInput })
    }).then((res) => res.json());

    if (result.error) {
      responseText.textContent = `Erreur: ${result.error}`;
      statusTag.textContent = 'Erreur';
      return;
    }

    responseText.classList.remove('muted');
    responseText.textContent = result.response || result.answer || result.message || 'Réponse indisponible.';

    const phase = result.phase || result.metadata?.phase;
    statusTag.textContent = phase ? `Phase: ${phase}` : 'Terminé';

    if (showMetadata.checked) {
      metadataDetails.hidden = false;
    }

    metadataBlock.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    responseText.classList.remove('muted');
    responseText.textContent = `Erreur réseau: ${error.message}`;
    statusTag.textContent = 'Erreur';
  } finally {
    setLoading(false);
  }
});

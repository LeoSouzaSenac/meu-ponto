# Meu Ponto 2.0 — PWA local e mobile

Reaproveita a aplicação web React/TypeScript 1.5. Sem backend e sem sincronização. Dados armazenados no IndexedDB (com espelho de compatibilidade em localStorage).

## Executar

```bash
npm install
npm run dev
```

Build para publicação em HTTPS: `npm run build` e publicar a pasta `dist/`. Para instalar no celular, acessar via HTTPS e adicionar à tela inicial. O service worker oferece cache offline após o primeiro carregamento.

## Cálculos

- INSS 2026 progressivo: limites 1621, 2902,84, 4354,27, 8475,55 e alíquotas de 7,5%, 9%, 12%, 14%.
- IRRF 2026 progressivo: dedução simplificada de R$607,20 quando maior do que descontos legais; redução mensal para bruto até R$7350.
- VR: 1 unidade inteira por 480 minutos remunerados e crédito unitário configurável (R$39 é exemplo, não padrão).
- DSR: padrão professor 1/6; modo por calendário disponível para simulação, não soma automaticamente feriados ao 1/6.

## Segurança e limitações

Os valores são estimativas e podem divergir do ADP por eventos variáveis, adicional noturno, regras coletivas e deduções específicas. Tabelas tributárias de 2026 não devem ser reaplicadas automaticamente a anos posteriores. Cada dispositivo tem seus dados; exporte backups JSON com frequência. O modelo original de planilha pode conter dados pessoais: substitua o arquivo em `public/modelo-ponto-2026.xlsx` por uma cópia institucional limpa antes de distribuir. A exportação bloqueia horas transferidas ou parciais cuja data não caiba fielmente no modelo. O formato do modelo só cobre competências específicas de 2026/27; deve ser atualizado para anos seguintes.

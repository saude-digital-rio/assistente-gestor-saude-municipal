# Assistente de Gestor de Saúde Municipal

Extensão Chrome (Manifest V3) para reunir em um ZIP relatórios do SISAB por Equipe/INE, do SIA e do SI-PNI no TabNet municipal. O SISAB usa a sessão já autenticada do e-Gestor; a extensão não recebe senha nem token do gov.br. O TabNet é público e pode ser consultado de qualquer página.

## Instalação

1. Abra `chrome://extensions`, ative **Modo do desenvolvedor** e clique **Carregar sem compactação**.
2. Selecione a pasta deste repositório.
3. O ícone azul aparece em qualquer página. Clique nele para abrir o painel lateral do Chrome. Escolha a última competência disponível ou as últimas 6 ou 12.
4. Abra as sanfonas **SISAB**, **SIA @ TabNet Municipal** e **SI-PNI @ TabNet Municipal**, ative os relatórios desejados e clique **Extrair ZIP**. O toggle **Todos** de cada módulo seleciona ou desmarca todos os seus relatórios; o botão **?** explica o acesso e o uso.
5. Para incluir relatórios do SISAB, entre no e-Gestor e abra `https://egestorab.saude.gov.br/paginas/acessoRestrito/perfilAcesso.xhtml`. Os toggles do SISAB só ficam disponíveis nessa página.
6. Mantenha o painel lateral aberto e, se selecionou SISAB, também a aba do e-Gestor/SISAB. O progresso mostra uma etapa por módulo e uma lista rolável dos CSVs recebidos. As etapas seguem a ordem SISAB, SIA e SI-PNI quando selecionadas. O ZIP será salvo em Downloads.

O SISAB gera um CSV por competência e tipo de relatório. **Atendimentos** gera três CSVs por competência: Atendimento Individual para enfermeiro e médico, Atendimento Odontológico para dentista. Com seus quatro toggles ligados e o período padrão de 6 competências, são 36 CSVs. A extensão seleciona as competências mais recentes disponíveis nos relatórios escolhidos; quando produção e atividade coletiva são selecionadas juntas, usa competências comuns aos dois módulos. Os arquivos incluem as equipes 70, 71, 72, 73, 74, 76 e sem equipe.

O TabNet gera mais dois CSVs, um de **procedimentos na APS** (CF, CMS e CSE; complexidades média, alta e não se aplica) e outro de **procedimentos especializados** (policlínicas, Super Centro ZO, CECCO/CECO, DEAMB e CAPS; todas as complexidades). Cada CSV tem estabelecimentos nas linhas e meses de cobrança nas colunas. A extensão busca 1, 6 ou 12 competências mais recentes com dados, consultando desde janeiro de 2025 em blocos de até três para respeitar o tempo limite do TabNet. O formulário é codificado em ISO-8859-1. A lista de estabelecimentos é obtida do próprio formulário a cada extração; categorias ausentes nele não aparecem no resultado.

O **SI-PNI** gera um CSV da campanha de vacinação contra COVID-19, com estabelecimento de saúde nas linhas, mês da vacinação nas colunas e total de registros consultados como conteúdo. A extensão busca as 1, 6 ou 12 competências mais recentes com dados no formulário público do SI-PNI. Normalmente consulta todos os meses selecionados em uma única requisição; se algum mês não tiver dados, consulta os anteriores até completar o período.

Todos os CSVs são salvos em UTF-8 com BOM. O ZIP usa armazenamento sem compressão para evitar dependências externas.

O filtro de visitas é **Visita realizada**; o de atividade coletiva é **Quantidade de Atividade Coletiva**. A extensão não tenta fazer login nem contorna o gov.br. Se a sessão expirar, entre novamente no e-Gestor e reinicie a extração.

## Desenvolvimento

Não há etapa de build nem dependências de produção. Rode `npm test` para validar seleção de competências, filtros do TabNet, limpeza dos CSVs e integridade do ZIP. Recarregue a extensão em `chrome://extensions` após alterações. A nova permissão para `tabnet.rio.rj.gov.br` pode exigir aceite no Chrome.

O Chrome gera o ID da extensão como uma sequência própria. O nome acima aparece no menu de extensões; o ID técnico não pode ser trocado por um nome legível. Mantenha esta pasta no mesmo caminho para preservar o ID da instalação local.

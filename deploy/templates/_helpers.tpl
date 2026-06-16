{{- define "ui.hostName" -}}
{{- default .Values.name .Values.host.name -}}
{{- end -}}

{{- define "ui.dashboardName" -}}
{{- default "ui-dashboard" .Values.dashboard.name -}}
{{- end -}}

{{- define "ui.vpcName" -}}
{{- default "ui-vpc" .Values.vpc.name -}}
{{- end -}}

{{- define "ui.iamName" -}}
{{- default "ui-iam" .Values.iam.name -}}
{{- end -}}

{{- define "ui.hostImage" -}}
{{- default .Values.image .Values.host.image -}}
{{- end -}}

{{- define "ui.hostImagePullPolicy" -}}
{{- default .Values.imagePullPolicy .Values.host.imagePullPolicy -}}
{{- end -}}

{{- define "ui.dashboardImage" -}}
{{- if .Values.dashboard.image -}}
{{- .Values.dashboard.image -}}
{{- else -}}
{{- $hostImage := include "ui.hostImage" . -}}
{{- if contains "host" $hostImage -}}
{{- replace "host" "dashboard" $hostImage -}}
{{- else -}}
{{- "kacho-ui-future-dashboard:dev" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "ui.dashboardImagePullPolicy" -}}
{{- default (include "ui.hostImagePullPolicy" .) .Values.dashboard.imagePullPolicy -}}
{{- end -}}

{{- define "ui.vpcImage" -}}
{{- if .Values.vpc.image -}}
{{- .Values.vpc.image -}}
{{- else -}}
{{- $hostImage := include "ui.hostImage" . -}}
{{- if contains "host" $hostImage -}}
{{- replace "host" "vpc" $hostImage -}}
{{- else -}}
{{- "kacho-ui-future-vpc:dev" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "ui.vpcImagePullPolicy" -}}
{{- default (include "ui.hostImagePullPolicy" .) .Values.vpc.imagePullPolicy -}}
{{- end -}}

{{- define "ui.iamImage" -}}
{{- if .Values.iam.image -}}
{{- .Values.iam.image -}}
{{- else -}}
{{- $hostImage := include "ui.hostImage" . -}}
{{- if contains "host" $hostImage -}}
{{- replace "host" "iam" $hostImage -}}
{{- else -}}
{{- "kacho-ui-future-iam:dev" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "ui.iamImagePullPolicy" -}}
{{- default (include "ui.hostImagePullPolicy" .) .Values.iam.imagePullPolicy -}}
{{- end -}}

{{- define "ui.dashboardUpstream" -}}
{{- if .Values.host.upstreams.dashboard -}}
{{- .Values.host.upstreams.dashboard -}}
{{- else -}}
{{- printf "%s.%s.svc.cluster.local:%v" (include "ui.dashboardName" .) .Release.Namespace .Values.dashboard.port -}}
{{- end -}}
{{- end -}}

{{- define "ui.vpcUpstream" -}}
{{- if .Values.host.upstreams.vpc -}}
{{- .Values.host.upstreams.vpc -}}
{{- else -}}
{{- printf "%s.%s.svc.cluster.local:%v" (include "ui.vpcName" .) .Release.Namespace .Values.vpc.port -}}
{{- end -}}
{{- end -}}

{{- define "ui.iamUpstream" -}}
{{- if .Values.host.upstreams.iam -}}
{{- .Values.host.upstreams.iam -}}
{{- else -}}
{{- printf "%s.%s.svc.cluster.local:%v" (include "ui.iamName" .) .Release.Namespace .Values.iam.port -}}
{{- end -}}
{{- end -}}

{{- define "ui.hostPort" -}}
{{- default .Values.port .Values.host.port -}}
{{- end -}}

{{- define "ui.hostReplicas" -}}
{{- default .Values.replicas .Values.host.replicas -}}
{{- end -}}

{{- define "ui.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "ui.hostSelectorLabels" -}}
app: {{ include "ui.hostName" . }}
app.kubernetes.io/name: {{ include "ui.hostName" . }}
app.kubernetes.io/component: host
{{- end -}}

{{- define "ui.dashboardSelectorLabels" -}}
app: {{ include "ui.dashboardName" . }}
app.kubernetes.io/name: {{ include "ui.dashboardName" . }}
app.kubernetes.io/component: dashboard-remote
{{- end -}}

{{- define "ui.vpcSelectorLabels" -}}
app: {{ include "ui.vpcName" . }}
app.kubernetes.io/name: {{ include "ui.vpcName" . }}
app.kubernetes.io/component: vpc-remote
{{- end -}}

{{- define "ui.iamSelectorLabels" -}}
app: {{ include "ui.iamName" . }}
app.kubernetes.io/name: {{ include "ui.iamName" . }}
app.kubernetes.io/component: iam-remote
{{- end -}}

{{- define "ui.hostResources" -}}
{{- if .Values.host.resources }}
{{- toYaml .Values.host.resources }}
{{- else }}
{{- toYaml .Values.resources }}
{{- end }}
{{- end -}}

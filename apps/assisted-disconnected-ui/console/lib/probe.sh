# shellcheck shell=bash
# Readiness probe for the disconnected UI server.
#
# Deliberately implemented with bash's /dev/tcp rather than curl: the
# ocp/base-rhel9 image ships curl-minimal, and pulling in full curl just for a
# readiness check would swap it out for no benefit.

# probe_url URL -> 0 if the server answers
#
# For https we can only check that the port accepts a connection, since bash
# has no TLS client. That is enough: the point is to know when the Go proxy is
# listening, and the proxy only starts listening after its assisted-service
# health check has passed.
probe_url() {
  local url=$1 scheme rest host port fd status

  scheme=${url%%://*}
  rest=${url#*://}
  rest=${rest%%/*}
  host=${rest%%:*}
  port=${rest##*:}
  if [[ ${port} == "${host}" ]]; then
    [[ ${scheme} == https ]] && port=443 || port=80
  fi

  exec {fd}<>"/dev/tcp/${host}/${port}" 2>/dev/null || return 1

  if [[ ${scheme} != http ]]; then
    exec {fd}>&-
    return 0
  fi

  status=''
  # 1>&N rather than >&N: the latter is the "redirect both streams" form in
  # some shells, which would fight with the read below.
  if printf 'GET / HTTP/1.0\r\nHost: %s\r\nConnection: close\r\n\r\n' "${host}" 1>&"${fd}"; then
    read -r -t 5 status <&"${fd}"
  fi
  exec {fd}>&-

  [[ ${status} == *' 200 '* || ${status} == *' 30'[0-9]' '* ]]
}

# wait_for_url URL TIMEOUT -> 0 once the server answers. TIMEOUT of 0 waits
# forever, which is the default: on a rendezvous node the operator has nothing
# else to look at, so waiting beats giving up.
wait_for_url() {
  local url=$1 timeout=$2 deadline=0

  ((timeout > 0)) && deadline=$((SECONDS + timeout))
  while true; do
    if probe_url "${url}"; then
      log "${url} is up"
      return 0
    fi
    if ((deadline > 0 && SECONDS >= deadline)); then
      return 1
    fi
    sleep 2
  done
}
